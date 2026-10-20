/** Editor de Google al que se redirige cada tipo de archivo. */
export type EditorKind = 'docs' | 'sheets' | 'slides';

/** Información de una extensión soportada. */
export interface ExtInfo {
	kind: EditorKind;
	mime: string;
}

/** Extensiones Office soportadas -> editor y MIME de Drive. */
export const EXTENSIONS: Record<string, ExtInfo> = {
	docx: { kind: 'docs', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
	doc: { kind: 'docs', mime: 'application/msword' },
	docm: { kind: 'docs', mime: 'application/vnd.ms-word.document.macroEnabled.12' },
	xlsx: { kind: 'sheets', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
	xls: { kind: 'sheets', mime: 'application/vnd.ms-excel' },
	xlsm: { kind: 'sheets', mime: 'application/vnd.ms-excel.sheet.macroEnabled.12' },
	pptx: { kind: 'slides', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
	ppt: { kind: 'slides', mime: 'application/vnd.ms-powerpoint' },
	pptm: { kind: 'slides', mime: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12' },
};

/** Devuelve la info de la extensión de un filename (case-insensitive) o null. */
export function extInfo(filename: string): ExtInfo | null {
	const i = filename.lastIndexOf('.');
	if (i <= 0 || i === filename.length - 1) return null;
	const ext = filename.slice(i + 1).toLowerCase();
	return EXTENSIONS[ext] ?? null;
}

/** Construye la URL del editor de Google para un id de Drive. */
export function editorUrl(kind: EditorKind, id: string): string {
	const base = kind === 'docs' ? 'document' : kind === 'sheets' ? 'spreadsheets' : 'presentation';
	return `https://docs.google.com/${base}/d/${id}/edit`;
}
