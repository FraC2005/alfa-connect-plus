export const km = (n: number) => Math.round(n).toLocaleString('it-IT');

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

export const daysUntil = (isoDate: string) => Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000);

export const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
