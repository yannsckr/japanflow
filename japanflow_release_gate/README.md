# Gate de upload JapanFlow

Instale na raiz da pasta `japanflow-web-deploy`. Nenhum arquivo do app, Firestore ou Storage e alterado por este pacote.

1. Execute `node .\japanflow_release_gate\check-env.mjs` (só confere formato da configuração; nunca exibe valores).
2. Execute `npx firebase emulators:exec --only firestore,storage --project demo-japanflow-storage "node japanflow_release_gate/test-storage.cjs"`. Requer Firebase CLI, Java e dependencias npm instaladas; porta 8085 para Firestore e 9199 para Storage, conforme firebase.json. Faz testes localmente sem tocar em producao.
3. Execute `.\japanflow_release_gate\deploy-seguro.ps1` para typecheck, lint, prettier check, testes e build, com trava de env.
4. Verifique manualmente `git diff`, `git status` e configuracoes. So depois use `npx firebase deploy --only storage:rules --project japanflow-erp` e `npx firebase deploy --only hosting --project japanflow-erp`. O Hosting so precisa ser republicado se seu build mudou desde a ultima publicacao com env correto.
5. Teste login, upload Beta de APK assinado valido, download e bloqueios de permissao. Evite release obrigatoria ate testar a atualizacao instalada.

O teste verifica as regras para `cosmos/releases` e/ou `japanflow/releases` conforme existirem no arquivo. O caminho interno `cosmos` nao e a marca exibida.

ATENCAO: o Firebase Storage `getDownloadURL()` gera link de token compartilhavel. As regras de leitura so se aplicam a acessos autenticados pelo SDK, nao tornam um link de token privado. Validacao de extensao/MIME nao prova assinatura ou integridade de APK.
