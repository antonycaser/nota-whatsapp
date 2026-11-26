"""
Junta logica.ts + index.ts num ARQUIVO ÚNICO (deploy/funcao-api.ts), pronto para
colar no editor de Edge Functions do painel do Supabase.
  python3 crm-supabase/dev/montar-funcao.py
"""
import os, re
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
api = os.path.join(B, 'supabase', 'functions', 'api')
logica = open(os.path.join(api, 'logica.ts')).read()
index = open(os.path.join(api, 'index.ts')).read()
index = re.sub(r"^import \{[^}]*\} from './logica\.ts';\n", '', index, flags=re.M)
imports = re.findall(r"^import .*;$", index, flags=re.M)
corpo = re.sub(r"^import .*;\n", '', index, flags=re.M)
saida = ("// ARQUIVO GERADO por dev/montar-funcao.py — edite logica.ts / index.ts e gere de novo.\n"
         "// Cole TODO este conteúdo na função \"api\" do Supabase (Edge Functions).\n"
         + "\n".join(imports) + "\n\n" + logica + "\n\n" + corpo)
os.makedirs(os.path.join(B, 'deploy'), exist_ok=True)
open(os.path.join(B, 'deploy', 'funcao-api.ts'), 'w').write(saida)
print('deploy/funcao-api.ts gerado:', len(saida.splitlines()), 'linhas')
