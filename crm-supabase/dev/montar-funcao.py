"""
Junta _shared/logica.ts + _shared/adaptador.ts + index.ts de cada função num
ARQUIVO ÚNICO, pronto para colar no editor de Edge Functions do Supabase:
  deploy/funcao-api.ts     → função "api"
  deploy/funcao-google.ts  → função "google" (Verify JWT desligado)
  python3 crm-supabase/dev/montar-funcao.py
"""
import os, re
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
F = os.path.join(B, 'supabase', 'functions')
ler = lambda *p: open(os.path.join(F, *p), encoding='utf-8').read()
LOCAL = re.compile(r"^import [^;]*from '\.\./_shared/[^']+';\n|^import [^;]*from '\./logica\.ts';\n", re.M)
EXTERNO = re.compile(r"^import .*;$", re.M)


def montar(nome):
    partes = [ler('_shared', 'logica.ts'), ler('_shared', 'adaptador.ts'), ler(nome, 'index.ts')]
    partes = [LOCAL.sub('', p) for p in partes]
    imports = []
    for p in partes:
        for i in EXTERNO.findall(p):
            if i not in imports: imports.append(i)
    corpo = [EXTERNO.sub('', p) for p in partes]
    saida = ("// ARQUIVO GERADO por dev/montar-funcao.py — edite supabase/functions/ e gere de novo.\n"
             f"// Cole TODO este conteúdo na função \"{nome}\" do Supabase (Edge Functions).\n"
             + "\n".join(imports) + "\n\n" + "\n\n".join(corpo))
    assert "from '../" not in saida and "from './" not in saida
    os.makedirs(os.path.join(B, 'deploy'), exist_ok=True)
    open(os.path.join(B, 'deploy', f'funcao-{nome}.ts'), 'w', encoding='utf-8').write(saida)
    print(f'deploy/funcao-{nome}.ts gerado:', len(saida.splitlines()), 'linhas')


for n in ['api', 'google']: montar(n)
