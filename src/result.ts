/** Códigos de error tipados de la aplicación. */
export type ErrorCode =
	| 'USAGE'
	| 'SETUP_FAILED'
	| 'FILE_NOT_FOUND'
	| 'UNSUPPORTED_EXT'
	| 'CONFIG_ERROR'
	| 'NO_CLIENT'
	| 'AUTH_FAILED'
	| 'AUTH_EXPIRED'
	| 'TOKEN_REFRESH_FAILED'
	| 'DRIVE_ERROR'
	| 'FOLDER_ERROR'
	| 'UPLOAD_ERROR'
	| 'BROWSER_ERROR';

/** Error de aplicación con contexto para el usuario. */
export interface AppError {
	code: ErrorCode;
	message: string;
	detail?: string;
}

/** Manejo funcional de errores: [error, data]. */
export type Result<T> = [AppError, null] | [null, T];

/** Crea un resultado de error. */
export const err = <T>(code: ErrorCode, message: string, detail?: string): Result<T> =>
	[{ code, message, detail }, null];

/** Crea un resultado exitoso. */
export const ok = <T>(value: T): Result<T> => [null, value];

/** Indica si un Result es error. */
export const isErr = <T>(r: Result<T>): r is [AppError, null] => r[0] !== null;
