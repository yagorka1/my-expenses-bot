export function formatDate(date: any) {
  if (!date) return '';
  // Ensure we have a Date object
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU');
}
