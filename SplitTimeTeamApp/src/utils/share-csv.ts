import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase() || 'export';
}

export async function shareCsvFile(options: {
  csv: string;
  fileNameBase: string;
  dialogTitle: string;
}): Promise<void> {
  const fileName = `${sanitizeFileName(options.fileNameBase)}.csv`;
  const file = new File(Paths.cache, fileName);

  if (file.exists) {
    file.delete();
  }

  file.create();
  file.write(options.csv);

  await Sharing.shareAsync(file.uri, {
    dialogTitle: options.dialogTitle,
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
  });
}

