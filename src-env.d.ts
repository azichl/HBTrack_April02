declare module '@rapideditor/country-coder' {
    export function iso1A2Code(point: [number, number]): string | null;
    export function iso1A3Code(point: [number, number]): string | null;
    export function iso1NCode(point: [number, number]): string | null;
}

declare module 'i18n-iso-countries' {
    export function registerLocale(localeData: any): void;
    export function getName(isoCode: string, lang: string): string | undefined;
}

declare module 'i18n-iso-countries/langs/en.json' {
    const value: any;
    export default value;
}
