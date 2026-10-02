import glob, io, os
BARRA = chr(92)
def norm(f): return f.replace(BARRA, '/')
web = [norm(f) for f in glob.glob('apps/web/app/**/page.tsx', recursive=True)]
mob = [norm(f) for f in glob.glob('apps/mobile/app/**/*.tsx', recursive=True) if not f.endswith('_layout.tsx')]
textos = []
for pad in ['apps/web/teste/**/*.ts*', 'apps/web/components/*.test.tsx', 'apps/mobile/teste/**/*.ts*']:
    for f in glob.glob(pad, recursive=True):
        textos.append(io.open(f, encoding='utf-8').read())
tudo = '\n'.join(textos)
def coberta(c):
    rel = c.replace('apps/web/', '').replace('apps/mobile/', '').replace('.tsx', '')
    for a in [rel, rel.replace('app/', ''), os.path.dirname(rel).replace(BARRA, '/')]:
        if a and a in tudo:
            return True
    return False
for nome, lista in [('WEB', web), ('APP', mob)]:
    sem = [f for f in lista if not coberta(f)]
    print('=== %s: %d telas, %d sem prova' % (nome, len(lista), len(sem)))
    for f in sem: print('   -', f)
