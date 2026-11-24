import { Component, ElementRef, OnDestroy, output, signal, viewChild } from '@angular/core';
import { parseBilletsCode } from '../../utils/barcode';

type Decoder = () => Promise<string | null>;

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  template: `
    <dialog #dialog (click)="onDialogClick($event)" (close)="stop()" aria-labelledby="scan-title">
      <header>
        <div>
          <h2 id="scan-title">Escanear boleto</h2>
          <p>Deixe o código de barras na horizontal, dentro da faixa.</p>
        </div>
        <button type="button" class="x" (click)="close()" aria-label="Fechar">✕</button>
      </header>

      <div class="viewport">
        <video #video playsinline muted></video>
        <div class="guide" aria-hidden="true"><span></span></div>
        @if (status() === 'starting') { <div class="overlay">Abrindo a câmera…</div> }
        @if (status() === 'error') { <div class="overlay">{{ message() }}</div> }
      </div>

      <footer>
        <span class="hint">Aproxime até o código ficar nítido. Com o celular deitado, a leitura é mais rápida.</span>
        @if (torchSupported()) {
          <button type="button" class="btn" (click)="toggleTorch()">
            {{ torchOn() ? 'Desligar lanterna' : 'Ligar lanterna' }}
          </button>
        }
        <button type="button" class="btn" (click)="close()">Cancelar</button>
      </footer>
    </dialog>
  `,
  styles: [`
    dialog {
      width: min(560px, calc(100vw - 24px));
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--card);
      color: var(--foreground);
      box-shadow: 0 20px 50px rgb(0 0 0 / 25%);
    }
    dialog::backdrop { background: rgb(0 0 0 / 55%); }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px 12px; }
    h2 { margin: 0 0 3px; font-size: 16px; font-weight: 700; }
    p { margin: 0; color: var(--muted-foreground); font-size: 13px; }
    .x { border: 0; background: none; color: var(--muted-foreground); font-size: 16px; cursor: pointer; }
    .viewport { position: relative; width: 100%; max-height: 62vh; aspect-ratio: 4 / 3; overflow: hidden; background: #000; }
    video { width: 100%; height: 100%; object-fit: cover; }
    .guide { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
    .guide span {
      position: relative; width: 88%; height: 26%;
      border: 2px solid rgb(255 255 255 / 90%); border-radius: 10px;
      box-shadow: 0 0 0 999px rgb(0 0 0 / 38%); overflow: hidden;
    }
    .guide span::after {
      content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 2px;
      background: #ef4444; animation: scan 1.6s ease-in-out infinite alternate;
    }
    @keyframes scan { from { top: 10%; } to { top: 90%; } }
    .overlay {
      position: absolute; inset: 0; display: grid; place-items: center; padding: 20px;
      background: rgb(0 0 0 / 72%); color: #fff; font-size: 14px; text-align: center;
    }
    footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 18px 16px; }
    .hint { flex: 1 1 100%; color: var(--muted-foreground); font-size: 12px; }
    .btn {
      min-height: 36px; padding: 0 14px; border: 1px solid var(--border); border-radius: 8px;
      background: var(--card); color: var(--foreground); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .btn:hover { background: var(--muted); }
  `]
})
export class BarcodeScannerComponent implements OnDestroy {
  readonly scanned = output<string>();

  private dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  readonly status = signal<'idle' | 'starting' | 'scanning' | 'error'>('idle');
  readonly message = signal('');
  readonly torchSupported = signal(false);
  readonly torchOn = signal(false);

  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxOpenTimeMs = 30 * 1000;
  private running = false;
  private decode: Decoder | null = null;

  async open(): Promise<void> {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) return;
    dialog.showModal();
    this.timeoutTimer = setTimeout(() => this.close(), this.maxOpenTimeMs);
    await this.start();
  }

  onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  close(): void {
    this.stop();
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
  }

  stop(): void {
    this.running = false;
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video().nativeElement.srcObject = null;
    this.torchOn.set(false);
    this.status.set('idle');
  }

  ngOnDestroy(): void {
    this.stop();
  }

  async toggleTorch(): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    const next = !this.torchOn();
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      this.torchOn.set(next);
    } catch {
      /* lanterna indisponível neste aparelho */
    }
  }

  private async start(): Promise<void> {
    this.status.set('starting');
    this.message.set('');

    if (!navigator.mediaDevices?.getUserMedia) {
      return this.fail('A câmera só funciona em conexão segura (HTTPS) e em navegador compatível.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
    } catch (e: any) {
      return this.fail(
        e?.name === 'NotAllowedError'
          ? 'Permissão da câmera negada. Libere o acesso nas configurações do navegador.'
          : 'Não foi possível abrir a câmera deste aparelho.'
      );
    }

    // o usuário pode ter fechado o modal enquanto a permissão era pedida
    if (!this.dialog().nativeElement.open) {
      this.stop();
      return;
    }

    const video = this.video().nativeElement;
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);

    const caps: any = this.stream.getVideoTracks()[0]?.getCapabilities?.() ?? {};
    this.torchSupported.set(!!caps.torch);

    this.decode = await this.createDecoder(video);
    if (!this.dialog().nativeElement.open) {
      this.stop();
      return;
    }
    this.status.set('scanning');
    this.running = true;
    this.loop();
  }

  /** Usa o leitor nativo (rápido) quando ele lê ITF; senão cai no ZXing. */
  private async createDecoder(video: HTMLVideoElement): Promise<Decoder> {
    const Native = (window as any).BarcodeDetector;
    if (Native) {
      try {
        const formats: string[] = await Native.getSupportedFormats();
        if (formats.includes('itf')) {
          const detector = new Native({ formats: ['itf'] });
          return async () => (await detector.detect(video))[0]?.rawValue ?? null;
        }
      } catch {
        /* segue para o ZXing */
      }
    }

    const { BarcodeFormat, BinaryBitmap, DecodeHintType, HTMLCanvasElementLuminanceSource, HybridBinarizer, MultiFormatReader } =
      await import('@zxing/library');

    const reader = new MultiFormatReader();
    const hints = new Map<any, any>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.ITF]],
      [DecodeHintType.TRY_HARDER, true]
    ]);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    return async () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;
      const scale = Math.min(1, 1280 / w);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const bitmap = new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)));
        return reader.decode(bitmap, hints).getText();
      } catch {
        return null; // nenhum código neste quadro
      }
    };
  }

  private loop = async (): Promise<void> => {
    if (!this.running || !this.decode) return;
    try {
      const raw = await this.decode();
      if (raw) {
        const digits = raw.replace(/\D/g, '');
        // só aceita leituras que passam na validação dos dígitos verificadores
        if (parseBilletsCode(digits).ok) {
          navigator.vibrate?.(60);
          this.scanned.emit(digits);
          this.close();
          return;
        }
      }
    } catch {
      /* ignora e tenta o próximo quadro */
    }
    this.timer = setTimeout(this.loop, 120);
  };

  private fail(message: string): void {
    this.message.set(message);
    this.status.set('error');
  }
}
