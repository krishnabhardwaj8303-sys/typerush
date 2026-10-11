import { describe, expect, it } from 'vitest';
import { classCsv, csvCell, safeFileName } from './exportTools';

describe('csv export', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
  });
  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('Asha')).toBe('Asha');
  });
  it('builds rows including students who have not finished', () => {
    const csv = classCsv('10-A', 2, [{ rank: 1, name: 'Ravi, K', wpm: 41.6, accuracy: 97.4, score: 210.2 }], ['Mina']);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Class,Round,Rank,Name,WPM,Accuracy %,Score,Status');
    expect(lines[1]).toBe('10-A,2,1,"Ravi, K",42,97,210,finished');
    expect(lines[2]).toBe('10-A,2,,Mina,,,,not finished');
  });
  it('makes safe file names', () => {
    expect(safeFileName('Class 10/A: "x"')).toBe('Class_10_A_x');
    expect(safeFileName('???')).toBe('typerush');
  });
});

describe('file names with Hindi', () => {
  it('keeps letters from any script', () => {
    expect(safeFileName('\u0939\u093f\u0902\u0926\u0940 / A')).toBe('\u0939\u093f\u0902\u0926\u0940_A');
  });
});
