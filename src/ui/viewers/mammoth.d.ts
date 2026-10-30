declare module 'mammoth' {
  export interface ConversionResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  export interface ConvertOptions {
    arrayBuffer: ArrayBuffer;
  }

  export function convertToHtml(input: ConvertOptions): Promise<ConversionResult>;
}
