# Observatório Eleitoral

Primeiro protótipo do dashboard web responsivo.

## 1. Instalar

```bash
npm install
```

## 2. Executar

```bash
npm run dev
```

Abra http://localhost:3000

## 3. Supabase

Copie `.env.example` para `.env.local` e preencha as variáveis do projeto Supabase.
Depois, execute `supabase/schema.sql` no SQL Editor.

Nesta primeira etapa o dashboard usa dados simulados. O próximo módulo será o coletor dos dados públicos do TSE, seguido da API de análise e da camada de IA.


## Tipografia

A interface usa **Fira Sans** via `next/font/google`, mantendo o carregamento otimizado do Next.js.
