// Types for lib.mjs (plain JavaScript, so create-cera runs without a build).
export declare const TEMPLATE_PORT_BLOCK: number;
export declare const TEMPLATE_DEV_PORT: number;
export declare function blockPorts(block: number): number[];
export declare function portIsFree(port: number): Promise<boolean>;
export declare function pickPortBlock(isFree?: (port: number) => Promise<boolean>, range?: { from?: number; to?: number }): Promise<number | null>;
export declare function pickDevPort(isFree?: (port: number) => Promise<boolean>, range?: { from?: number; to?: number }): Promise<number | null>;
export declare function movePorts(text: string, ports: { block: number; devPort: number }): string;
export declare function siteSupabaseConfig(text: string, site: { name: string; block: number; devPort: number }): string;
export declare function packageName(folderName: string): string;
export declare function shellQuote(text: string): string;
export declare function envValue(text: string, key: string): string | undefined;
