#!/usr/bin/env python3
"""Prepara apenas páginas do COSMOS no worktree japonflow-erp, sem commit/deploy."""
import sys,shutil
from pathlib import Path
if len(sys.argv)!=3:sys.exit('Uso: python preparar_frontend_web.py <raiz_develop_cosmos> <raiz_worktree_japanflow_erp>')
source=Path(sys.argv[1]).resolve();target=Path(sys.argv[2]).resolve()
if source==target:sys.exit('As pastas source e target devem ser diferentes')
for root in [source,target]:
 if not (root/'src/App.tsx').is_file():sys.exit('Pasta não parece ser repositório: '+str(root))
paths=['src/pages/CosmosReleasesPage.tsx','src/pages/CosmosOccurrencesPage.tsx','src/cosmos/releases/releaseService.ts']
for rel in paths:
 if not (source/rel).exists():sys.exit('Falta no COSMOS: '+rel)
 if (target/rel).exists():sys.exit('Já existe no ERP: '+rel+' (revisar antes de sobrescrever)')
app_path=target/'src/App.tsx'; sidebar_path=target/'src/components/AppSidebar.tsx'
app=app_path.read_text(encoding='utf8');nav=sidebar_path.read_text(encoding='utf8')
def insert_once(text,anchor,repl,label):
 if text.count(anchor)!=1:raise RuntimeError(label+': ponto de integração mudou. Nenhum arquivo modificado.')
 return text.replace(anchor,repl,1)
if 'CosmosReleasesPage' in app or '/ti/cosmos-releases' in nav:sys.exit('ERP já parece integrado; não duplicar')
app=insert_once(app,"const BacklogPage = lazy(() => import('@/pages/BacklogPage'));", "const BacklogPage = lazy(() => import('@/pages/BacklogPage'));\nconst CosmosReleasesPage = lazy(() => import('@/pages/CosmosReleasesPage'));\nconst CosmosOccurrencesPage = lazy(() => import('@/pages/CosmosOccurrencesPage'));",'import')
app=insert_once(app,'<Route path="/backlog" element={<BacklogPage />} />', '<Route path="/backlog" element={<BacklogPage />} />\n                <Route path="/ti/cosmos-releases" element={<CosmosReleasesPage />} />\n                <Route path="/ti/cosmos-ocorrencias" element={<CosmosOccurrencesPage />} />','rotas')
anchor='            {primaryItems.map(renderNavItem)}'
navlink="""            {(isTiDashboardUser || authenticatedUser?.username?.trim().toLowerCase() === 'ryan') && (
              <>
                <button type="button" title="Releases COSMOS" onClick={() => handleNav('/ti/cosmos-releases')}
                  className={cn('jf-interactive mb-2 flex h-10 w-full items-center rounded-xl text-sm font-medium', collapsed ? 'justify-center' : 'gap-3 px-3', location.pathname === '/ti/cosmos-releases' ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
                  <Bell className="h-5 w-5 shrink-0" />{!collapsed && <span>Releases COSMOS</span>}
                </button>
                <button type="button" title="Ocorrências COSMOS" onClick={() => handleNav('/ti/cosmos-ocorrencias')}
                  className={cn('jf-interactive mb-2 flex h-10 w-full items-center rounded-xl text-sm font-medium', collapsed ? 'justify-center' : 'gap-3 px-3', location.pathname === '/ti/cosmos-ocorrencias' ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
                  <Bell className="h-5 w-5 shrink-0" />{!collapsed && <span>Ocorrências COSMOS</span>}
                </button>
              </>
            )}
"""
nav=insert_once(nav,anchor,navlink+anchor,'sidebar')
for rel in paths:
 dest=target/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source/rel,dest)
app_path.write_text(app,encoding='utf8');sidebar_path.write_text(nav,encoding='utf8')
print('Frontend COSMOS integrado SOMENTE no worktree local:',target)
print('Revisar git diff, typecheck, build, regras do Firebase e hosting antes de commit/deploy.')
