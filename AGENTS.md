# Skills do projeto

- Antes de cada tarefa, consulte as skills disponíveis, incluindo as do ECC, e aplique todas as que forem relevantes ao trabalho e à sua verificação. Leia o `SKILL.md` de cada skill selecionada e siga suas instruções ao implementar, revisar, testar ou preparar uma publicação.

# Catálogo do Salão das Casas

- Toda carta nova ou renomeada precisa de um retrato reconhecível da pessoa ou do personagem correto. Use a versão correspondente à obra na carta.
- Salve o retrato em JPEG dentro de `public/portraits/` e registre o caminho local e a URL HTTPS da fonte em `public/portraits.json`, com o nome exato de `public/cards.json`.
- Inclua o retrato no mesmo conjunto de alterações da carta. O arquivo deve funcionar offline. Letra, selo genérico e URL remota sozinha não contam como retrato.
- Abra a imagem para conferir o conteúdo e rode `python3 validate_catalog.py` antes de concluir qualquer mudança no catálogo. O servidor também roda essa validação ao iniciar.
