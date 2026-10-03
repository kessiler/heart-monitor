# Heart Monitor: a pesquisa revisitada

## Objetivo

Preservar o projeto C++ de 2015 e apresentar uma implementação independente em Rust da ideia de extrair um sinal de pulso das variações de cor de uma região do vídeo. A apresentação e a aplicação são bilíngues (português e inglês). Web e desktop compartilham o processamento. A aplicação é uma demonstração experimental, sem alegação de precisão clínica.

## Componentes e fluxo

`câmera / vídeo local / sinal sintético → região da testa → RGB com timestamp → Rust → sinal, espectro, estimativa e qualidade → interface`

- `legacy/`: código histórico e cascade original, preservados com os avisos de terceiros.
- `crates/pulse-core/`: biblioteca Rust independente de câmera e interface. Recebe amostras reais com timestamp; conserva uma janela de 12 segundos; rejeita dados inválidos; reamostra, remove tendência e calcula o espectro de 42 a 180 bpm. Não publica um número quando a janela ou o sinal não sustentam uma estimativa.
- `crates/pulse-wasm/`: bindings WebAssembly para o núcleo e magnificação visual. A magnificação usa redução espacial e diferença entre filtros IIR temporais calculados a partir do intervalo real dos quadros. Ela é independente do sinal usado para estimar o pulso.
- `web/`: landing e aplicação estáticas. Captura, escolha da região, visualização e tradução pertencem ao adaptador do navegador. A região pode ser posicionada manualmente; instruções deixam essa escolha explícita. Não há envio de vídeo, cadastro, analytics ou backend.
- `src-tauri/`: host desktop Rust usando a mesma interface e WebAssembly. Bundles de Windows, macOS e Linux são produzidos por tags de versão; assinatura/notarização exige certificados próprios.

O browser conserva somente a preferência de idioma. Vídeos locais são abertos por object URL e liberados ao encerrar. Trocar de origem ou região reinicia a janela; parar desliga todas as tracks da câmera. Dados sintéticos são sempre identificados e nunca apresentados como medição humana.

## Contrato científico

A reescrita se inspira em Wu et al. (2012), sem incorporar o código ou vídeos do MIT, distribuídos sob condições específicas de pesquisa. O algoritmo é uma adaptação leve orientada à região de interesse, não uma reprodução integral do sistema MATLAB.

O artigo de Rodrigues, Pereira e Pádua (2016), DOI [10.18674/exacta.v9i1.1666](https://doi.org/10.18674/exacta.v9i1.1666), descreve o trabalho histórico. Suas 20 medições em quatro pessoas e seu erro padrão de 1,08 bpm pertencem àquele estudo; não certificam a nova implementação. Movimento, iluminação, compressão, câmera e características de pele afetam a extração. Um indicador de periodicidade do sinal não equivale à probabilidade de precisão.

## Entrega e manutenção

Git Flow: `master` é a versão publicada; `develop` integra desenvolvimento; `feature/*` contém funcionalidades; `release/*` prepara uma versão; tags `vX.Y.Z` produzem pacotes. O Pages publica somente após testes Rust, testes de interface e build estático. Pull requests não recebem permissões de publicação. Releases desktop são criadas como drafts para revisão dos instaladores.

O código novo usa licença MIT; avisos de dependências e código histórico têm seus próprios termos. Arquivos temporários, ferramentas e builds são ignorados. Testes sintéticos verificam comportamento matemático e estados da interface; comparação contra um dispositivo de referência é uma etapa independente de validação experimental.
