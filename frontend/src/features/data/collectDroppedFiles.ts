/**
 * Collect files from a drag-drop DataTransfer, expanding directories recursively
 * via the non-standard File System Access entries API (webkitGetAsEntry).
 */
export async function collectFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = dt.items
  if (items && items.length > 0) {
    const entries: FileSystemEntry[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item) continue
      const entry =
        typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
      if (entry) entries.push(entry)
    }
    if (entries.length > 0) {
      const files: File[] = []
      for (const entry of entries) {
        await walkEntry(entry, '', files)
      }
      if (files.length) return files
    }
  }
  return Array.from(dt.files ?? [])
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry)
    const rel = prefix ? `${prefix}/${file.name}` : file.name
    // Preserve relative path for FormData / display (Chrome sets webkitRelativePath on directory picks only)
    Object.defineProperty(file, 'webkitRelativePath', {
      value: rel,
      writable: false,
      configurable: true,
    })
    out.push(file)
    return
  }
  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry
    const nextPrefix = prefix ? `${prefix}/${dir.name}` : dir.name
    const children = await readAllDirectoryEntries(dir.createReader())
    for (const child of children) {
      if (child.name === '.' || child.name === '..') continue
      await walkEntry(child, nextPrefix, out)
    }
  }
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (!batch.length) {
            resolve(all)
            return
          }
          all.push(...batch)
          readBatch()
        },
        reject,
      )
    }
    readBatch()
  })
}
