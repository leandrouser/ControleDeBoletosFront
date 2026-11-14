export interface ParsedBillets {
  tipo: 'bancario' | 'arrecadacao';
  origem: 'barcode' | 'linha-digitavel';
  barcode: string;
  linha: string;
  valor: number | null;
  vencimento: string | null;
  banco: string | null;
  segmento: string | null;
}

export type ParseResult = { ok: true; data: ParsedBillets } | { ok: false; error: string };

const BANCOS: Record<string, string> = {
  '001': 'Banco do Brasil', '033': 'Santander', '070': 'BRB', '077': 'Inter',
  '104': 'Caixa', '121': 'Agibank', '136': 'Unicred', '208': 'BTG Pactual',
  '212': 'Original', '237': 'Bradesco', '260': 'Nubank', '290': 'PagBank',
  '318': 'BMG', '336': 'C6 Bank', '341': 'Itaú', '389': 'Mercantil',
  '422': 'Safra', '633': 'Rendimento', '655': 'Votorantim', '745': 'Citibank',
  '748': 'Sicredi', '756': 'Sicoob'
};

const SEGMENTOS: Record<string, string> = {
  '1': 'Prefeitura', '2': 'Saneamento', '3': 'Energia elétrica e gás',
  '4': 'Telecomunicações', '5': 'Órgão governamental', '6': 'Carnê / outras empresas',
  '7': 'Multa de trânsito', '9': 'Uso exclusivo do banco'
};

const fail = (error: string): ParseResult => ({ ok: false, error });

function mod10(num: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    const p = Number(num[i]) * weight;
    sum += p > 9 ? p - 9 : p;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

function weightedSum11(num: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    sum += Number(num[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  return sum;
}

function mod11Bancario(num: string): number {
  const dv = 11 - (weightedSum11(num) % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

function mod11Arrecadacao(num: string): number {
  const rest = weightedSum11(num) % 11;
  return rest === 0 || rest === 1 ? 0 : 11 - rest;
}

function linha47ToBarcode(line: string): string | null {
  const c1 = line.slice(0, 9);
  const c2 = line.slice(10, 20);
  const c3 = line.slice(21, 31);
  if (
    mod10(c1) !== Number(line[9]) ||
    mod10(c2) !== Number(line[20]) ||
    mod10(c3) !== Number(line[31])
  ) {
    return null;
  }
  return line.slice(0, 4) + line[32] + line.slice(33, 47) + line.slice(4, 9) + c2 + c3;
}

function barcodeToLinha47(bc: string): string {
  const livre = bc.slice(19);
  const f1 = bc.slice(0, 4) + livre.slice(0, 5);
  const f2 = livre.slice(5, 15);
  const f3 = livre.slice(15, 25);
  return f1 + mod10(f1) + f2 + mod10(f2) + f3 + mod10(f3) + bc[4] + bc.slice(5, 19);
}

function linha48ToBarcode(line: string): string | null {
  if (line[0] !== '8') return null;
  const byProduct = '67'.includes(line[2]) ? mod10 : mod11Arrecadacao;
  let barcode = '';
  for (let i = 0; i < 48; i += 12) {
    const block = line.slice(i, i + 11);
    const dv = Number(line[i + 11]);
    if (byProduct(block) !== dv && mod10(block) !== dv && mod11Arrecadacao(block) !== dv) return null;
    barcode += block;
  }
  return barcode;
}

function barcodeToLinha48(bc: string): string {
  const calc = '67'.includes(bc[2]) ? mod10 : mod11Arrecadacao;
  let line = '';
  for (let i = 0; i < 44; i += 11) {
    const block = bc.slice(i, i + 11);
    line += block + calc(block);
  }
  return line;
}

export function formatDigitableLine(line: string): string {
  if (line.length === 47) {
    return (
      `${line.slice(0, 5)}.${line.slice(5, 10)} ${line.slice(10, 15)}.${line.slice(15, 21)} ` +
      `${line.slice(21, 26)}.${line.slice(26, 32)} ${line[32]} ${line.slice(33)}`
    );
  }
  return [0, 12, 24, 36].map((i) => `${line.slice(i, i + 11)}-${line[i + 11]}`).join(' ');
}

function dueFromFactor(factor: number): string | null {
  if (factor === 0) return null;
  const day = 86_400_000;
  const oldCycle = Date.UTC(1997, 9, 7) + factor * day;
  const newCycle = oldCycle + 9000 * day;
  const now = Date.now();
  const chosen = Math.abs(oldCycle - now) <= Math.abs(newCycle - now) ? oldCycle : newCycle;
  return new Date(chosen).toISOString().slice(0, 10);
}

function parseBancario(bc: string, origem: ParsedBillets['origem']): ParseResult {
  if (mod11Bancario(bc.slice(0, 4) + bc.slice(5)) !== Number(bc[4])) {
    return fail('Dígito verificador inválido. Confira se o código está completo e correto.');
  }
  const valor = Number(bc.slice(9, 19)) / 100;
  return {
    ok: true,
    data: {
      tipo: 'bancario',
      origem,
      barcode: bc,
      linha: formatDigitableLine(barcodeToLinha47(bc)),
      valor: valor > 0 ? valor : null,
      vencimento: dueFromFactor(Number(bc.slice(5, 9))),
      banco: BANCOS[bc.slice(0, 3)] ? `${BANCOS[bc.slice(0, 3)]} (${bc.slice(0, 3)})` : `Banco ${bc.slice(0, 3)}`,
      segmento: null
    }
  };
}

function parseArrecadacao(bc: string, origem: ParsedBillets['origem']): ParseResult {
  const produto = bc[2];
  if (!'6789'.includes(produto)) return fail('Código de conta/tributo inválido.');

  const calc = produto === '6' || produto === '7' ? mod10 : mod11Arrecadacao;
  if (calc(bc.slice(0, 3) + bc.slice(4)) !== Number(bc[3])) {
    return fail('Dígito verificador inválido. Confira se o código está completo e correto.');
  }
  const valor = produto === '6' || produto === '8' ? Number(bc.slice(4, 15)) / 100 : 0;
  return {
    ok: true,
    data: {
      tipo: 'arrecadacao',
      origem,
      barcode: bc,
      linha: formatDigitableLine(barcodeToLinha48(bc)),
      valor: valor > 0 ? valor : null,
      vencimento: null,
      banco: null,
      segmento: SEGMENTOS[bc[1]] ?? null
    }
  };
}

export function parseBilletsCode(input: string): ParseResult {
  const digits = (input ?? '').replace(/\D/g, '');
  if (!digits) return fail('Informe o código de barras ou a linha digitável.');

  let barcode: string | null;
  let origem: ParsedBillets['origem'] = 'linha-digitavel';

  switch (digits.length) {
    case 44:
      barcode = digits;
      origem = 'barcode';
      break;
    case 47:
      barcode = linha47ToBarcode(digits);
      break;
    case 48:
      barcode = linha48ToBarcode(digits);
      break;
    default:
      return fail(
        `O código tem ${digits.length} dígitos. Esperado: 44 (código de barras), 47 (boleto) ou 48 (conta/tributo).`
      );
  }

  if (!barcode) return fail('Dígito verificador inválido. Confira se digitou todos os números.');
  return barcode.startsWith('8') ? parseArrecadacao(barcode, origem) : parseBancario(barcode, origem);
}

export function beneficiarySignature(barcode: string): string | null {
  if (!/^\d{44}$/.test(barcode)) return null;

  if (barcode[0] === '8') {
    return `ARR-${barcode[1]}-${barcode.slice(15, 23)}`;
  }

  const banco = barcode.slice(0, 3);
  const livre = barcode.slice(19);
  switch (banco) {
    case '341': return `341-${livre.slice(12, 22)}`;                          // Itaú: agência + conta
    case '237': return `237-${livre.slice(0, 4)}-${livre.slice(17, 24)}`;     // Bradesco: agência + conta
    case '001': return `001-${livre.startsWith('000000') ? livre.slice(6, 13) : livre.slice(0, 6)}`; // BB: convênio
    case '033': return `033-${livre.slice(1, 8)}`;                            // Santander: código do cedente
    case '104': return `104-${livre.slice(0, 7)}`;                            // Caixa: código do beneficiário
    case '756': return `756-${livre.slice(1, 5)}-${livre.slice(7, 14)}`;      // Sicoob: cooperativa + cliente
    default: return null;
  }
}
