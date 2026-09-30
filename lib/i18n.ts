// ponytail: dicionário plano, sem lib de i18n — 2 idiomas, cabe num objeto.

export type Lang = 'pt-br' | 'en-us';

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'pt-br', label: 'PT' },
  { value: 'en-us', label: 'EN' },
];

// nome completo usado na diretiva de idioma do system prompt (sempre em inglês)
export const LANG_NAME: Record<Lang, string> = {
  'pt-br': 'Brazilian Portuguese (pt-BR)',
  'en-us': 'English (en-US)',
};

export const LANG_LOCALE: Record<Lang, string> = {
  'pt-br': 'pt-BR',
  'en-us': 'en-US',
};

const dict = {
  'pt-br': {
    openSessions: 'Abrir sessões',
    changeLanguage: 'Mudar idioma',
    removeFile: 'Remover arquivo',
    attachFile: 'Anexar arquivo',
    send: 'Enviar',
    uploadFile: 'Enviar arquivo',
    emptyTitle: 'Analise seus dados',
    emptySubtitle:
      'Envie um arquivo CSV, Excel ou JSON — ou comece agora com um conjunto de exemplo.',
    loading: 'carregando…',
    demoDisclaimer: 'Dados fictícios só para demonstração.',
    inputPlaceholder: 'Pergunte sobre seus dados…',
    fileSent: '[Arquivo enviado: {name}]',
    errorPrefix: 'Erro: {msg}',
    demoLoadError: 'Erro ao carregar dados de exemplo: {msg}',
    demoNotFound: 'não encontrei {file}',
    unknownError: 'erro desconhecido',
    sessions: 'Sessões',
    close: 'Fechar',
    newSession: '+ Nova sessão',
    untitledSession: 'Nova sessão',
    noSessions: 'Nenhuma sessão ainda',
    deleteSession: 'Excluir sessão',
    noNumericData: 'Sem dados numéricos.',
    noChartData: 'Sem dados para exibir.',
    fileTooBig: 'Arquivo "{name}" ({mb} MB) excede o limite de 3 MB.',
    fileTypeBlocked:
      'Tipo de arquivo não permitido: {ext}. Apenas CSV, Excel, JSON, Parquet e TXT.',
    mimeBlocked: 'Tipo MIME não permitido: {type}.',
    injectionRejected:
      'Desculpe, não posso processar essa mensagem. Por favor, reformule sua pergunta.',
    messageTooLong: 'Mensagem excede o limite de {max} caracteres.',
  },
  'en-us': {
    openSessions: 'Open sessions',
    changeLanguage: 'Change language',
    removeFile: 'Remove file',
    attachFile: 'Attach file',
    send: 'Send',
    uploadFile: 'Upload file',
    emptyTitle: 'Analyze your data',
    emptySubtitle:
      'Upload a CSV, Excel or JSON file — or start now with a sample dataset.',
    loading: 'loading…',
    demoDisclaimer: 'Fictional data for demonstration only.',
    inputPlaceholder: 'Ask about your data…',
    fileSent: '[File sent: {name}]',
    errorPrefix: 'Error: {msg}',
    demoLoadError: 'Error loading sample data: {msg}',
    demoNotFound: "couldn't find {file}",
    unknownError: 'unknown error',
    sessions: 'Sessions',
    close: 'Close',
    newSession: '+ New session',
    untitledSession: 'New session',
    noSessions: 'No sessions yet',
    deleteSession: 'Delete session',
    noNumericData: 'No numeric data.',
    noChartData: 'No data to display.',
    fileTooBig: 'File "{name}" ({mb} MB) exceeds the 3 MB limit.',
    fileTypeBlocked:
      'File type not allowed: {ext}. Only CSV, Excel, JSON, Parquet and TXT.',
    mimeBlocked: 'MIME type not allowed: {type}.',
    injectionRejected:
      "Sorry, I can't process that message. Please rephrase your question.",
    messageTooLong: 'Message exceeds the {max} character limit.',
  },
} as const;

export type TKey = keyof (typeof dict)['pt-br'];

export function t(
  lang: Lang,
  key: TKey,
  vars?: Record<string, string | number>,
): string {
  let s: string = dict[lang][key] ?? dict['pt-br'][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}
