import { describe, it, expect } from 'bun:test';
import { extInfo, editorUrl, EXTENSIONS } from '../src/editors.ts';

describe('editors', () => {
	describe('extInfo', () => {
		it('debería mapear docx a Google Docs', () => {
			const info = extInfo('informe.docx');
			expect(info?.kind).toBe('docs');
			expect(info?.mime).toContain('wordprocessingml');
		});

		it('debería mapear xlsx a Google Sheets', () => {
			expect(extInfo('datos.xlsx')?.kind).toBe('sheets');
		});

		it('debería mapear pptx a Google Slides', () => {
			expect(extInfo('clase.pptx')?.kind).toBe('slides');
		});

		it('debería ser case-insensitive', () => {
			expect(extInfo('FINAL.DOCX')?.kind).toBe('docs');
			expect(extInfo('mix.XlSx')?.kind).toBe('sheets');
		});

		it('debería manejar nombres con varios puntos', () => {
			expect(extInfo('informe.final.v2.docx')?.kind).toBe('docs');
		});

		it('debería soportar formatos legacy y macro', () => {
			for (const ext of ['doc', 'xls', 'ppt', 'docm', 'xlsm', 'pptm']) {
				expect(extInfo(`a.${ext}`)).not.toBeNull();
			}
		});

		it('debería devolver null para extensiones no soportadas', () => {
			expect(extInfo('imagen.png')).toBeNull();
			expect(extInfo('sin_extension')).toBeNull();
			expect(extInfo('final.')).toBeNull();
		});
	});

	describe('editorUrl', () => {
		it('debería construir URLs por editor', () => {
			expect(editorUrl('docs', 'abc123')).toBe('https://docs.google.com/document/d/abc123/edit');
			expect(editorUrl('sheets', 'abc123')).toBe('https://docs.google.com/spreadsheets/d/abc123/edit');
			expect(editorUrl('slides', 'abc123')).toBe('https://docs.google.com/presentation/d/abc123/edit');
		});
	});

	it('todas las extensiones deben tener mime y kind válidos', () => {
		for (const [ext, info] of Object.entries(EXTENSIONS)) {
			expect(['docs', 'sheets', 'slides']).toContain(info.kind);
			expect(info.mime).toContain('/');
			expect(ext.length).toBeGreaterThanOrEqual(2);
		}
	});
});
