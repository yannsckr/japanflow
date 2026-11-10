# JapanFlow COSMOS — etapa 2 (instalador corrigido, sem commit)

**Correção 10/11:** removida colisão entre duas substituições da seção de notificações (`button push: esperado 1 trecho, encontrado 0`). O pacote anterior falhava na pré-validação antes de gravar arquivos. Esta versão preserva a verificação de todos os trechos antes de modificar o projeto.

Objetivo: concluir integrações pendentes da homologação e reunir as mudanças para UM commit de release ao final dos testes. **Nada neste pacote publica arquivos nem executa git commit/push**.

## Pré-requisito

Você já aplicou o hotfix `JapanFlow-COSMOS-Hotfix-Homologacao.zip` em `develop/cosmos`, como informado na conversa. O script é incremental e verifica trechos antes de alterar qualquer arquivo; se não os encontrar, interrompe sem modificar o projeto. Faz backup dos arquivos originais em `_backup_cosmos_etapa2_*`.

## Aplicação (PowerShell)

Coloque o ZIP na raiz do repositório e extraia-o **sem substituir os arquivos da aplicação**, pois os arquivos novos ficam dentro de `cosmos_stage2/arquivos`:

```powershell
cd C:\Users\User\Documents\prog\japanflow
Expand-Archive .\JapanFlow-COSMOS-Etapa2-PreRelease.zip -DestinationPath . -Force
python .\cosmos_stage2\aplicar_etapa2.py
npm install @capacitor/push-notifications@^8
npx prettier --write src/cosmos/mobile/roles/motoboy/MotoboyExperience.tsx src/cosmos/mobile/roles/motoboy/motoboyWorkflow.ts src/cosmos/mobile/roles/motoboy/cosmosPush.ts src/cosmos/mobile/roles/motoboy/motoboy-app.css src/pages/ChatPage.tsx src/pages/CosmosOccurrencesPage.tsx src/App.tsx src/components/AppSidebar.tsx functions/index.js functions/cosmosNotifications.js
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run cosmos:android:sync
cd android
.\gradlew.bat assembleDebug
cd ..
```

**Não faça commit nem deploy automaticamente.** A formatação completa via `npm run format` pode alterar arquivos além do hotfix; confira `git status --short` e `git diff` antes do commit final. Alternativa segura: `npx prettier --write` apenas nos arquivos modificados.

## Funcionalidades

- Chat: abre Contatos quando ainda não existem conversas recentes; trata altura do chat mobile. **A integração de mensagens ainda depende dos testes reais de permissões Firebase e autenticação**; não substitui o backend do ERP.
- Ocorrências: cria documentos estruturados `motoboy_occurrences` com regras de autorização por corrida. Página ERP `/ti/cosmos-ocorrencias`, link na lateral TI e notificação para admins/expedição/TI. As observações da corrida não são modificadas.
- Notificações: inscrição Android sob consentimento explícito com `@capacitor/push-notifications`; grava token em `motoboy_device_tokens/{userId}` protegido por regras. O app agora lê `system_notifications` além da coleção legada `notifications`. Ao sair da conta, remove o vínculo do token.
- Backend: Cloud Functions v2 para enviar FCM quando chega notificação em `system_notifications` e para criar notificações ao registrar ocorrência, iniciar uma nova atribuição ou receber mensagem privada. Push mostra texto genérico na tela bloqueada, sem valores ou conteúdo da conversa.
- GPS/mapa/ocultação de valores: preserva o hotfix validado anterior. Não substitui o Google Maps por um sistema de navegação curva a curva próprio.

## Passos obrigatórios no Firebase/Android

1. Console Firebase > Configurações do projeto > Seus apps: registre/confirme o aplicativo Android com **applicationId `com.japanflow.mobile`**.
2. Faça download de `google-services.json` e coloque somente no computador em `android/app/google-services.json`. **Não anexe nem envie esse arquivo neste chat e não o commite**. Confira a configuração do Gradle e que o plugin google-services foi aplicado durante o build.
3. Habilite Cloud Messaging para o projeto correto e confira autorização de notificações do Android.
4. Reveja as diferenças em `firestore.rules` e teste com emuladores/contas reais. O patch altera regras de acesso para as coleções específicas. O ERP em produção pode estar em outra branch e ter regras diferentes: não sobrescreva regras implantadas sem reconciliação.
5. Somente após revisão, deploy dos componentes backend:

```powershell
firebase use japanflow-erp
firebase deploy --only firestore:rules,functions:cosmosSendNativeNotification,functions:cosmosNotifyOccurrence,functions:cosmosNotifyNewRide,functions:cosmosNotifyChat --project japanflow-erp
```

**Atenção:** `firebase deploy` é publicação efetiva e deve ser feito só depois das validações. Essas Functions têm custo potencial e ativam disparos reais. Antes de colocar em produção, use ambiente de testes/usuários de homologação. É possível que as regras precisem ser mescladas com a branch atual de produção.

## Testes de aceite

- Após ativar notificações no app, `motoboy_device_tokens/{userId}` aparece no Firestore (valor do token é sensível: não envie).
- Uma notificação `system_notifications` para o usuário logado aparece no app e é marcada como lida.
- Com app em segundo plano, nova atribuição gera push sem expor valores.
- Nova mensagem privada gera push genérico; abrir chat permite visualizar e responder à mensagem no Firestore.
- Ocorrência é enviada com >= 10 caracteres, aparece na página ERP e envia aviso à equipe autorizada.
- Dispositivo A e B não recebem notificações cruzadas após logout/troca de conta.
- Google Maps, GPS e foto da notinha mantêm o comportamento validado.
- Regras testadas com usuário motoboy (não pode ler ocorrência de outro motoboy nem tokens de terceiros), TI e administrador.

## Frontend online — importantíssimo

As novas rotas existem em `develop/cosmos`, mas o site publicado segue `japanflow-erp`. **Esse ZIP não faz merge nem publica o frontend de produção**. Para cumprir a solicitação de um só commit, finalize os testes no branch de homologação, prepare a integração seletiva na branch de produção em um worktree separado, revise os conflitos e faça um único commit (preferencialmente squash) **apenas quando toda a versão estiver pronta**. Um `git push develop/cosmos` não é deploy do site.

Para diagnosticar onde o hosting aponta: `git branch --show-current`, `git status --short`, `cat .firebaserc`, `cat firebase.json`; consulte também o painel do provedor (Firebase Hosting / Cloud Run / Render). Não dê deploy com `firebase deploy --only hosting` antes de confirmar o alvo correto e a reconciliação das rotas.

## Observações de segurança

- Firestore não oferece restrição por campo na mesma leitura de documento. Esconder `rideValue` do UI **não impede que o APK acesse esse campo** se a leitura do documento for autorizada; para confidencialidade real, mova valores para coleção restrita ou sirva dados filtrados pelo backend.
- Push não é garantia de entrega; para estado operacional use Firestore em tempo real e trate o push como alerta.
- Rotas internas Google Maps exigem chave corretamente restrita e APIs de direções habilitadas. No estado atual o aplicativo pode abrir o Google Maps externo para navegação curva a curva.
- Este pacote foi verificado com scripts de transformação e sintaxe de JavaScript, **não foi compilado contra as dependências completas da branch nem homologado no seu celular**.

**Regra crítica:** o repositório possui uma regra genérica permissiva para coleções não listadas. O instalador adiciona `motoboy_device_tokens` e `motoboy_occurrences` explicitamente às exceções dessa regra, impedindo que permissões genéricas invalidem as novas restrições. Se esse trecho não existir na sua branch, o instalador interrompe e você deve revisar manualmente antes de qualquer deploy.

### Preparação seletiva do frontend da branch de produção (sem commit)

Depois que a versão mobile estiver aprovada, pode-se preparar **uma pasta separada do ERP** para integrar somente as telas COSMOS, sem mesclar toda a branch `develop/cosmos`:

```powershell
# Execute na raiz do repositório develop/cosmos
# A pasta ../japanflow-web-release deve estar livre
 git worktree add ../japanflow-web-release japanflow-erp
 python .\cosmos_stage2\preparar_frontend_web.py . ../japanflow-web-release
 cd ../japanflow-web-release
 npm ci
 npm run typecheck
 npm run build
 git status --short
```

O script prepara `CosmosReleasesPage`, `CosmosOccurrencesPage`, `releaseService`, rotas e sidebar no worktree da branch de produção. Não executa commit, merge, push ou deploy. As regras de segurança são mantidas separadas para revisão; não as sobrescreva automaticamente na branch de produção. Não apague o worktree antes de preservar as alterações.

Um único commit por branch não equivale a um único SHA em branches diferentes: se for necessário publicar o código tanto em `develop/cosmos` quanto em `japanflow-erp`, o merge/squash é uma operação adicional e precisa ser decidido depois dos testes finais.
