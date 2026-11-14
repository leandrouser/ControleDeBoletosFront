import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RelatoriosService, Relatorio } from '../../services/relatorios.service';

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './relatorios.component.html',
  styleUrls: ['./relatorios.component.scss']
})
export class RelatoriosComponent implements OnInit {
  relatorio: Relatorio | null = null;
  loading = false;

  constructor(private relatoriosService: RelatoriosService) {}

  ngOnInit(): void {
    this.loadRelatorio();
  }

  loadRelatorio(): void {
    this.loading = true;
    this.relatoriosService.getRelatorio().subscribe({
      next: (data) => {
        this.relatorio = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Erro ao carregar relatório:', error);
        this.loading = false;
      }
    });
  }
}