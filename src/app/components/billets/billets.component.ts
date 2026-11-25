import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { concatMap, from, map, merge, tap, toArray } from 'rxjs';
import { Billets, BilletsService, BilletsSummary, BilletWeek, Page } from '../../services/billets.service';
import { CategoryDialogComponent } from '../category-dialog/category-dialog';
import { BarcodeScannerComponent } from '../barcode-scanner/barcode-scanner.component';
import { ParsedBillets, parseBilletsCode } from '../../utils/barcode';
import { Category, CategoriesService } from '../../services/category.service';

type StatusKey = 'pendente' | 'pago' | 'vencido';
type StatusFilter = 'todos' | StatusKey;
type FieldName = 'dueDate' | 'amount' | 'categoryId';
type InstallmentSchedule = 'none' | '15-days' | '30-days' | 'monthly';
type InstallmentForm = FormGroup<{
  dueDate: FormControl<string>;
  amount: FormControl<number | null>;
  barcode: FormControl<string>;
}>;

interface Row {
  billets: Billets;
  beneficiary: string;
  category: string;
  due: Date | null;
  status: StatusKey;
  statusLabel: string;
  statusClass: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function barcodeValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  const result = parseBilletsCode(value);
  return result.ok ? null : { barcode: result.error };
}

@Component({
  selector: 'app-billets',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    BarcodeScannerComponent,
    CategoryDialogComponent,
    CurrencyPipe,
    DatePipe
  ],
  templateUrl: './billets.component.html',
  styleUrls: ['./billets.component.scss']
})
export class BilletsComponent implements OnInit {
  private billetsService = inject(BilletsService);
  private categoriesService = inject(CategoriesService);
  readonly categories = signal<Category[]>([]);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  private formDialog = viewChild.required<ElementRef<HTMLDialogElement>>('formDialog');
  private deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');
  private scanner = viewChild.required(BarcodeScannerComponent);
  private categoryDialog = viewChild.required(CategoryDialogComponent);
  private scannerTarget: 'main' | number = 'main';

  readonly pageSize = 10;

  readonly tabs: { key: StatusFilter; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'pendente', label: 'Pendentes' },
    { key: 'vencido', label: 'Vencidos' },
    { key: 'pago', label: 'Pagos' }
  ];

  readonly billets = signal<Billets[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly weekPage = signal<Page<BilletWeek> | null>(null);
  readonly weekLoading = signal(false);
  readonly weekError = signal<string | null>(null);
  readonly weekItems = computed(() => this.weekPage()?.content ?? []);
  readonly weekPageTotal = computed(() =>
    this.weekItems().reduce((sum, b) => sum + b.amount, 0)
  );

  readonly categoriesLoading = signal(true);
  readonly categoriesError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly installmentBatchFailed = signal(false);
  readonly maxInstallments = 12;

  readonly installmentSchedules: { key: InstallmentSchedule; label: string }[] = [
    { key: 'none', label: 'Não parcelar' },
    { key: '15-days', label: 'A cada 15 dias' },
    { key: '30-days', label: 'A cada 30 dias' },
    { key: 'monthly', label: 'No mesmo dia dos meses seguintes' }
  ];

  readonly search = signal('');
  readonly statusFilter = signal<StatusFilter>('todos');
  readonly categoryFilter = signal<number | null>(null);
  readonly page = signal(1);

  readonly editing = signal<Billets | null>(null);
  readonly toDelete = signal<Row | null>(null);

  readonly parsed = signal<ParsedBillets | null>(null);
  readonly beneficiaryAuto = signal<string | null>(null);
  readonly lookingUp = signal(false);
  readonly editingName = signal(false);
  readonly copied = signal(false);
  readonly copiedBarcodeId = signal<number | null>(null);
  readonly copyError = signal<string | null>(null);

  readonly mainPage = signal<Page<Billets> | null>(null);

  readonly summary = signal<BilletsSummary>({
    todos: 0,
    pendente: 0,
    vencido: 0,
    pago: 0,
    openTotal: 0
  });

  readonly form = this.fb.group({
    barcode: ['', barcodeValidator],
    dueDate: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    installmentSchedule: ['none' as InstallmentSchedule],
    installmentCount: [2],
    beneficiary: [''],
    categoryId: [null as number | null, Validators.required],
    status: ['pendente'],
    paymentDate: ['']
  });
  readonly installmentDetails = new FormArray<InstallmentForm>([]);

  readonly rows = computed<Row[]>(() => {
    const cat = new Map(this.categories().map((o) => [o.id, o.name]));
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.billets().map((b): Row => {
      const due = parseDate(b.dueDate);

      const status: StatusKey =
        b.status === 'PAID'
          ? 'pago'
          : due && due < today
            ? 'vencido'
            : 'pendente';
      const dueToday = due?.getTime() === today.getTime();
      const dueTomorrow = due?.getTime() === tomorrow.getTime();
      const statusLabel =
        status === 'pago'
          ? 'Pago'
          : status === 'vencido'
            ? 'Vencido'
            : dueToday
              ? 'Vence hoje'
              : dueTomorrow
                ? 'Vence amanhã'
                : 'A vencer';
      const statusClass =
        status === 'pago'
          ? 'badge-pago'
          : status === 'vencido'
            ? 'badge-vencido'
            : dueToday
              ? 'badge-vence-hoje'
              : dueTomorrow
                ? 'badge-vence-amanha'
                : 'badge-a-vencer';

      return {
        billets: b,
        beneficiary: b.beneficiary?.trim() || 'N/A',
        category: b.categoryId == null
          ? 'N/A'
          : cat.get(b.categoryId) ?? 'N/A',
        due,
        status,
        statusLabel,
        statusClass
      };
    });
  });

  readonly counts = computed(() => this.summary());

  readonly filtered = computed(() => this.rows());

  readonly openTotal = computed(() => this.summary().openTotal);

  readonly totalPages = computed(() =>
    Math.max(1, this.mainPage()?.totalPages ?? 1)
  );

  readonly paged = computed(() => this.rows());

  readonly rangeLabel = computed(() => {
    const data = this.mainPage();

    if (!data || data.totalElements === 0) {
      return '0 resultados';
    }

    const start = data.number * data.size + 1;
    const end = Math.min(
      start + data.content.length - 1,
      data.totalElements
    );

    return `${start}–${end} de ${data.totalElements}`;
  });

  readonly duplicate = computed(() => {
    const code = this.parsed()?.barcode;
    if (!code) return null;
    const currentId = this.editing()?.id;
    return this.billets().find((b) => b.barcode === code && b.id !== currentId) ?? null;
  });

  ngOnInit(): void {
    merge(
      this.form.controls.installmentSchedule.valueChanges,
      this.form.controls.installmentCount.valueChanges,
      this.form.controls.dueDate.valueChanges,
      this.form.controls.amount.valueChanges
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncInstallmentDetails());

    this.loadCategories();
    this.load();
    this.loadSummary();
    this.loadWeek();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    const filter = {
      q: this.search().trim() || undefined,
      categoryId: this.categoryFilter() ?? undefined,
      status:
        this.statusFilter() === 'pago'
          ? 'PAID' as const
          : this.statusFilter() === 'pendente'
            ? 'PENDING' as const
            : undefined,
      overdue: this.statusFilter() === 'vencido'
        ? true
        : undefined
    };

    this.billetsService.getAll(
      filter,
      this.page() - 1,
      this.pageSize
    ).subscribe({
      next: (data) => {
        if (
          !data.content.length &&
          data.totalElements > 0 &&
          data.number > 0
        ) {
          this.page.set(data.totalPages);
          this.load();
          return;
        }

        this.mainPage.set(data);
        this.billets.set(data.content);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Erro ao carregar boletos:', err);
        this.error.set('Não foi possível carregar os boletos.');
        this.loading.set(false);
      }
    });
  }

  loadWeek(page = 0): void {
    this.weekLoading.set(true);
    this.weekError.set(null);

    this.billetsService.getDueThisWeek(page).subscribe({
      next: (data) => {
        if (!data.content.length && data.number > 0) {
          this.loadWeek(data.number - 1);
          return;
        }
        this.weekPage.set(data);
        this.weekLoading.set(false);
      },
      error: (err) => {
        console.error('Erro ao carregar boletos da semana:', err);
        this.weekError.set('Não foi possível carregar os boletos da semana.');
        this.weekLoading.set(false);
      }
    });
  }

  private reload(): void {
    this.load();
    this.loadSummary();
    this.loadWeek(this.weekPage()?.number ?? 0);
  }

  loadCategories(): void {
    this.categoriesLoading.set(true);
    this.categoriesError.set(null);
    this.categoriesService.getAll().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.categoriesLoading.set(false);
      },
      error: (err) => {
        console.error('Erro ao carregar categorias:', err);
        this.categoriesError.set('Não foi possível carregar as categorias.');
        this.categoriesLoading.set(false);
      }
    });
  }

  weekNext(): void {
    const p = this.weekPage();
    if (p && !p.last) this.loadWeek(p.number + 1);
  }

  weekPrevious(): void {
    const p = this.weekPage();
    if (p && !p.first) this.loadWeek(p.number - 1);
  }

  urgencyClass(b: BilletWeek): string {
    if (b.daysUntilDue < 0) return 'overdue';
    if (b.daysUntilDue === 0) return 'today';
    if (b.daysUntilDue === 1) return 'tomorrow';
    return '';
  }

  urgencyBadgeClass(b: BilletWeek): string {
    if (b.daysUntilDue < 0) return 'badge-vencido';
    if (b.daysUntilDue === 0) return 'badge-vence-hoje';
    if (b.daysUntilDue === 1) return 'badge-vence-amanha';
    return 'badge-a-vencer';
  }

  urgencyLabel(b: BilletWeek): string {
    if (b.daysUntilDue < 0) return 'Vencido';
    if (b.daysUntilDue === 0) return 'Vence hoje';
    if (b.daysUntilDue === 1) return 'Vence amanhã';
    return `Em ${b.daysUntilDue} dias`;
  }

  weekActionRow(b: BilletWeek): Row {
    const status: StatusKey =
      b.status === 'PAID'
        ? 'pago'
        : b.daysUntilDue < 0
          ? 'vencido'
          : 'pendente';
    const statusClass =
      status === 'pago'
        ? 'badge-pago'
        : status === 'vencido'
          ? 'badge-vencido'
          : b.daysUntilDue === 0
            ? 'badge-vence-hoje'
            : b.daysUntilDue === 1
              ? 'badge-vence-amanha'
              : 'badge-a-vencer';

    return {
      billets: {
        id: b.id,
        barcode: b.barcode,
        beneficiary: b.beneficiary,
        installmentNumber: b.installmentNumber,
        installmentCount: b.installmentCount,
        dueDate: b.dueDate,
        amount: b.amount,
        categoryId: b.categoryId,
        status: b.status
      },
      beneficiary: b.beneficiary?.trim() || 'N/A',
      category: b.categoryName,
      due: parseDate(b.dueDate),
      status,
      statusLabel: status === 'pago' ? 'Pago' : this.urgencyLabel(b),
      statusClass
    };
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.load();
    this.loadSummary();
  }

  onStatus(value: StatusFilter): void {
    this.statusFilter.set(value);
    this.page.set(1);
    this.load();
  }

  onCategory(value: string): void {
    this.categoryFilter.set(value ? Number(value) : null);
    this.page.set(1);
    this.load();
    this.loadSummary();
  }

  goTo(p: number): void {
    const nextPage = Math.min(
      Math.max(1, p),
      this.totalPages()
    );

    if (nextPage === this.page()) return;

    this.page.set(nextPage);
    this.load();
  }

  openForm(row?: Row): void {
    const b = row?.billets ?? null;
    this.editing.set(b);
    this.formError.set(null);
    this.installmentBatchFailed.set(false);
    this.parsed.set(null);
    this.copied.set(false);
    this.lookingUp.set(false);

    this.form.reset({
      barcode: '',
      dueDate: b?.dueDate?.slice(0, 10) ?? toIso(new Date()),
      amount: b?.amount ?? null,
      installmentSchedule: 'none',
      installmentCount: 2,
      beneficiary: '',
      categoryId: b?.categoryId ?? null,
      status: b?.status === 'PAID' ? 'pago' : 'pendente',
      paymentDate: b?.paymentDate?.slice(0, 10) ?? ''
    });

    this.beneficiaryAuto.set(b?.beneficiary?.trim() || null);
    this.editingName.set(false);

    if (b?.barcode) {
      const parsed = this.applyCode(b.barcode, false);
      this.form.controls.barcode.setValue(parsed?.linha ?? b.barcode);
    }

    this.formDialog().nativeElement.showModal();
  }

  closeForm(): void {
    this.formDialog().nativeElement.close();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const current = this.editing();
    const installmentSchedule = v.installmentSchedule ?? 'none';
    const installmentCount = v.installmentCount ?? 1;

    if (
      !current &&
      installmentSchedule !== 'none' &&
      (!Number.isInteger(installmentCount) ||
        installmentCount < 2 ||
        installmentCount > this.maxInstallments)
    ) {
      this.form.controls.installmentCount.markAsTouched();
      this.formError.set(`Informe entre 2 e ${this.maxInstallments} parcelas.`);
      return;
    }

    if (
      !current &&
      installmentSchedule !== 'none' &&
      (this.installmentDetails.length !== installmentCount - 1 ||
        this.installmentDetails.invalid)
    ) {
      this.installmentDetails.markAllAsTouched();
      this.formError.set('Preencha uma data e um valor válidos para cada parcela e confira os códigos de barras.');
      return;
    }

    const usingAuto = !!this.beneficiaryAuto() && !this.editingName();
    const name = (usingAuto ? this.beneficiaryAuto() : v.beneficiary)?.trim();

    if (!name) {
      this.form.controls.beneficiary.markAsTouched();
      return;
    }

    const paid = v.status === 'pago';
    const code = v.barcode ? parseBilletsCode(v.barcode) : null;

    const payload: Billets = {
      barcode: code && code.ok ? code.data.barcode : undefined,
      dueDate: v.dueDate!,
      amount: Number(v.amount),
      beneficiary: name,
      installmentNumber: current?.installmentNumber,
      installmentCount: current?.installmentCount,
      categoryId: v.categoryId!,
      status: paid ? 'PAID' : 'PENDING',
      paymentDate: paid ? v.paymentDate || toIso(new Date()) : undefined
    };

    let payloads = [payload];
    if (!current && installmentSchedule !== 'none') {
      payloads = [
        {
          ...payload,
          installmentNumber: 1,
          installmentCount
        },
        ...this.installmentDetails.getRawValue().map((detail, index) => {
          const enteredBarcode = detail.barcode.trim();
          const parsedBarcode = enteredBarcode ? parseBilletsCode(enteredBarcode) : null;
          return {
            ...payload,
            installmentNumber: index + 2,
            installmentCount,
            barcode: parsedBarcode?.ok ? parsedBarcode.data.barcode : null,
            dueDate: detail.dueDate,
            amount: Number(detail.amount),
            status: 'PENDING' as const,
            paymentDate: undefined
          };
        })
      ];

      const existingBarcodes = new Set(
        this.billets().map((billet) => billet.barcode).filter((code): code is string => !!code)
      );
      const batchBarcodes = new Set<string>();
      for (const installment of payloads) {
        const code = installment.barcode?.trim();
        if (!code) continue;
        if (existingBarcodes.has(code) || batchBarcodes.has(code)) {
          this.formError.set('Cada parcela precisa ter um código de barras único e ainda não cadastrado.');
          return;
        }
        batchBarcodes.add(code);
      }
    }

    let createdCount = 0;
    const request$ =
      current?.id != null
        ? this.billetsService.update(current.id, payload).pipe(map(() => undefined))
        : from(payloads).pipe(
            concatMap((installment) =>
              this.billetsService.create(installment).pipe(tap(() => createdCount++))
            ),
            toArray(),
            map(() => undefined)
          );

    this.saving.set(true);
    this.formError.set(null);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
        this.reload();
      },
      error: (err: unknown) => {
        console.error('Erro ao salvar boleto:', err);
        this.saving.set(false);
        if (!current && createdCount > 0) {
          const message = `Foram criadas ${createdCount} de ${payloads.length} parcelas. As restantes não foram salvas; confira a lista antes de tentar novamente.`;
          this.installmentBatchFailed.set(true);
          this.formError.set(message);
          this.reload();
          this.error.set(message);
          return;
        }
        const known =
          err instanceof HttpErrorResponse &&
          (err.status === 400 || err.status === 409);
        this.formError.set(
          (known && typeof err.error?.message === 'string' && err.error.message) ||
            'Não foi possível salvar o boleto. Confira os dados e tente novamente.'
        );
      }
    });
  }

  installmentCountInvalid(): boolean {
    const count = this.form.controls.installmentCount.value;
    return this.form.controls.installmentSchedule.value !== 'none' &&
      (count == null || !Number.isInteger(count) || count < 2 || count > this.maxInstallments);
  }

  private syncInstallmentDetails(): void {
    const schedule = this.form.controls.installmentSchedule.value ?? 'none';
    if (this.editing() || schedule === 'none') {
      this.installmentDetails.clear();
      return;
    }

    const rawCount = this.form.controls.installmentCount.value;
    const count = Math.min(
      this.maxInstallments,
      Math.max(2, typeof rawCount === 'number' && Number.isInteger(rawCount) ? rawCount : 2)
    );
    const futureCount = count - 1;

    while (this.installmentDetails.length < futureCount) {
      this.installmentDetails.push(this.createInstallmentDetail('', null));
    }
    while (this.installmentDetails.length > futureCount) {
      this.installmentDetails.removeAt(this.installmentDetails.length - 1);
    }

    const dueDates = this.buildInstallmentDates(
      this.form.controls.dueDate.value ?? '',
      schedule,
      count
    );
    const amount = this.form.controls.amount.value;
    this.installmentDetails.controls.forEach((installment, index) => {
      if (installment.controls.dueDate.pristine) {
        installment.controls.dueDate.setValue(dueDates?.[index + 1] ?? '', { emitEvent: false });
      }
      if (installment.controls.amount.pristine) {
        installment.controls.amount.setValue(amount, { emitEvent: false });
      }
    });
  }

  private createInstallmentDetail(dueDate: string, amount: number | null): InstallmentForm {
    return new FormGroup({
      dueDate: new FormControl(dueDate, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      amount: new FormControl<number | null>(amount, {
        validators: [Validators.required, Validators.min(0.01)]
      }),
      barcode: new FormControl('', {
        nonNullable: true,
        validators: [barcodeValidator]
      })
    });
  }

  private buildInstallmentDates(
    firstDueDate: string,
    schedule: InstallmentSchedule,
    count: number
  ): string[] | null {
    const firstDate = parseDate(firstDueDate);
    if (!firstDate) return null;

    return Array.from({ length: count }, (_, index) => {
      const dueDate = new Date(firstDate);
      if (schedule === '15-days') {
        dueDate.setDate(dueDate.getDate() + 15 * index);
      } else if (schedule === '30-days') {
        dueDate.setDate(dueDate.getDate() + 30 * index);
      } else if (schedule === 'monthly') {
        const month = new Date(firstDate.getFullYear(), firstDate.getMonth() + index, 1);
        const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        month.setDate(Math.min(firstDate.getDate(), lastDay));
        dueDate.setTime(month.getTime());
      }

      return toIso(dueDate);
    });
  }

  fieldInvalid(name: FieldName): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  openScanner(): void {
    this.scannerTarget = 'main';
    void this.scanner().open();
  }

  openInstallmentScanner(index: number): void {
    this.scannerTarget = index;
    void this.scanner().open();
  }

  onBarcodeInput(value: string): void {
    this.applyCode(value);
  }

  onInstallmentBarcodeInput(index: number, value: string): void {
    this.applyInstallmentCode(index, value);
  }

  onScanned(code: string): void {
    if (this.scannerTarget !== 'main') {
      const target = this.scannerTarget;
      this.scannerTarget = 'main';
      this.applyInstallmentCode(target, code, true);
      return;
    }

    const control = this.form.controls.barcode;
    control.setValue(code);
    control.markAsDirty();
    control.markAsTouched();
    const parsed = this.applyCode(code);
    if (parsed) control.setValue(parsed.linha);
  }

  async copyCode(): Promise<void> {
    const p = this.parsed();
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p.linha.replace(/\D/g, ''));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.formError.set('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  }

  async copyBarcode(row: Row): Promise<void> {
    const barcode = row.billets.barcode;
    if (!barcode) return;

    try {
      await navigator.clipboard.writeText(barcode);
      this.copyError.set(null);
      this.copiedBarcodeId.set(row.billets.id ?? null);
      setTimeout(() => {
        if (this.copiedBarcodeId() === row.billets.id) this.copiedBarcodeId.set(null);
      }, 2000);
    } catch (err) {
      console.error('Erro ao copiar código de barras:', err);
      this.copyError.set('Não foi possível copiar o código de barras. Tente novamente.');
    }
  }

  private applyCode(value: string, fill = true): ParsedBillets | null {
    const result = parseBilletsCode(value);

    if (!result.ok) {
      this.parsed.set(null);
      if (fill && (this.beneficiaryAuto() || this.lookingUp())) this.resetBeneficiary();
      return null;
    }

    const data = result.data;
    const previous = this.parsed()?.barcode;

    if (fill && previous !== data.barcode) {
      const f = this.form.controls;
      this.form.patchValue({
        dueDate: data.vencimento ?? f.dueDate.value,
        amount: data.valor ?? f.amount.value
      });
      this.parsed.set(data);
      this.lookupBeneficiary(data.barcode);
    }

    this.parsed.set(data);
    return data;
  }

  private applyInstallmentCode(index: number, value: string, markFromScanner = false): ParsedBillets | null {
    const installment = this.installmentDetails.at(index);
    if (!installment) return null;

    const result = parseBilletsCode(value);
    if (!result.ok) return null;

    const data = result.data;
    installment.controls.barcode.setValue(markFromScanner ? data.linha : value);
    installment.controls.barcode.markAsDirty();
    installment.controls.barcode.markAsTouched();

    if (data.vencimento) {
      installment.controls.dueDate.setValue(data.vencimento);
      installment.controls.dueDate.markAsDirty();
    }
    if (data.valor !== null) {
      installment.controls.amount.setValue(data.valor);
      installment.controls.amount.markAsDirty();
    }

    return data;
  }

  startEditName(): void {
    this.form.patchValue({ beneficiary: this.beneficiaryAuto() ?? '' });
    this.editingName.set(true);
  }

  invalidName(): boolean {
    const c = this.form.controls.beneficiary;
    return c.touched && !c.value?.trim();
  }

  private resetBeneficiary(): void {
    this.beneficiaryAuto.set(null);
    this.editingName.set(false);
    this.lookingUp.set(false);
    this.form.patchValue({ beneficiary: '' });
  }

  private lookupBeneficiary(barcode: string): void {
    this.resetBeneficiary();
    this.lookingUp.set(true);

    this.billetsService.findBeneficiary(barcode).subscribe({
      next: (r) => {
        if (this.parsed()?.barcode !== barcode) return;
        this.beneficiaryAuto.set(r?.beneficiary?.trim() || null);
        this.lookingUp.set(false);
      },
      error: () => {
        if (this.parsed()?.barcode === barcode) this.lookingUp.set(false);
      }
    });
  }

  markPaid(row: Row): void {
    const b = row.billets;
    if (b.id == null) return;
    this.billetsService
      .update(b.id, { ...b, status: 'PAID', paymentDate: toIso(new Date()) })
      .subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Erro ao marcar como pago:', err);
          this.error.set('Não foi possível marcar o boleto como pago.');
        }
      });
  }

  askDelete(row: Row): void {
    this.toDelete.set(row);
    this.deleteDialog().nativeElement.showModal();
  }

  cancelDelete(): void {
    this.deleteDialog().nativeElement.close();
    this.toDelete.set(null);
  }

  confirmDelete(): void {
    const id = this.toDelete()?.billets.id;
    if (id == null) return;
    this.saving.set(true);
    this.billetsService.delete(id).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelDelete();
        this.reload();
      },
      error: (err) => {
        console.error('Erro ao excluir billet:', err);
        this.saving.set(false);
        this.error.set('Não foi possível excluir o billet.');
        this.cancelDelete();
      }
    });
  }

  openCategoryDialog(): void {
    this.categoryDialog().open();
  }

  onCategorySaved(created: Category): void {
    this.categories.update((list) => [...list, created]);
    this.categoriesError.set(null);
    this.form.controls.categoryId.setValue(created.id ?? null);
    this.form.controls.categoryId.markAsDirty();
  }

  loadSummary(): void {
    this.billetsService.getSummary(
      this.search(),
      this.categoryFilter() ?? undefined
    ).subscribe({
      next: (data) => {
        this.summary.set(data);
      },
      error: (err) => {
        console.error('Erro ao carregar resumo dos boletos:', err);
      }
    });
  }
}
