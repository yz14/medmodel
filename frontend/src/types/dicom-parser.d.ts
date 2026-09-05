declare module 'dicom-parser' {
  export interface DataSet {
    string: (tag: string) => string | undefined
    uint16: (tag: string) => number | undefined
    int16?: (tag: string) => number | undefined
    floatString?: (tag: string) => number | undefined
    elements: Record<string, { dataOffset: number; length: number }>
    byteArray: Uint8Array
  }

  export function parseDicom(byteArray: Uint8Array): DataSet
}
