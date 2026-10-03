# Heart Monitor

Um TCC de 2015, publicado em 2016, revisitado com Rust e WebAssembly.
A demonstração extrai um sinal experimental de pulso das pequenas variações de cor de uma região do vídeo. Câmera e vídeos locais são processados no próprio dispositivo.

**[Experimentar / Try it](https://kessiler.github.io/heart-monitor/)** · **[Artigo original](https://doi.org/10.18674/exacta.v9i1.1666)** · **[Releases desktop](https://github.com/kessiler/heart-monitor/releases)**

## O que está aqui

- Landing page e demonstração em português e inglês.
- Núcleo Rust compartilhado com WebAssembly, janela temporal de 12 segundos, reamostragem com timestamps reais, espectro e indicador de periodicidade.
- Câmera, vídeo local e uma fonte sintética identificada de 72 bpm.
- Seleção manual da região da testa e magnificação de cor com estado separado da estimativa.
- Aplicativo desktop Tauri para Windows, macOS e Linux.
- GitHub Actions para testes, publicação no Pages e geração de instaladores por tag.
- Código C++ original preservado em `legacy/`, incluindo os avisos de terceiros.

A primeira versão da demonstração analisa uma região selecionada manualmente. Ela não porta o detector Haar ou o rastreamento multi-rosto do legado. O objetivo é tornar o experimento transparente e acessível em navegadores e aplicações desktop.

## Rodar localmente

Instale [Rust com rustup](https://rustup.rs/) e Node.js 24. A versão Rust e os componentes são definidos em `rust-toolchain.toml`.

```sh
npm ci
npm run build:wasm
npm run dev
```

Abra `http://127.0.0.1:5173`. Para a câmera, use localhost ou HTTPS, permita o acesso, ilumine o rosto de forma uniforme e coloque a região de análise na testa. Clique para reposicionar, arraste para dimensionar ou use as setas com a prévia focada. Trocar a região reinicia a análise; parar desliga a câmera.

```sh
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
npm run test:web
npm run build
npx playwright install chromium
npm run test:e2e
```

O build estático fica em `dist/`. `BASE_PATH=/heart-monitor/ npm run build:web` prepara o caminho do GitHub Pages; o fluxo automatizado calcula esse caminho a partir do repositório.

## Desktop e releases

Instale também os [pré-requisitos Tauri](https://v2.tauri.app/start/prerequisites/) do seu sistema.

```sh
npm run desktop:dev
npm run desktop:build
```

O desktop usa a mesma interface e o mesmo processamento local. A permissão da câmera depende do sistema operacional e de seu WebView. Os bundles ficam em `src-tauri/target/release/bundle/`.

Git Flow: desenvolva em `feature/*` a partir de `develop`, integre em `develop`, prepare em `release/*`, publique em `master` e sincronize `develop`. O Pages publica `master` somente depois dos checks. Uma tag `vX.Y.Z`, correspondente às versões de Cargo, npm e Tauri, gera uma release draft com instaladores de Windows, macOS e Linux. Revise os artefatos e publique o draft. Os instaladores atuais não possuem certificados de assinatura/notarização comercial; o sistema pode mostrar avisos de editor desconhecido.

## Pesquisa e limites

A ideia se inspira na [Ampliação Euleriana de Vídeo do MIT/Quanta (2012)](https://people.csail.mit.edu/mrub/evm/). Esta é uma implementação independente e leve para uma região de interesse, sem redistribuir código ou vídeos do MIT.

O artigo histórico é de **Kessiler Almeida Silveira Rodrigues, Moisés Henrique Ramos Pereira e Flávio Luis Cardeal Pádua**, e-xacta 9(1), 49–62 (2016), DOI [10.18674/exacta.v9i1.1666](https://doi.org/10.18674/exacta.v9i1.1666). A avaliação original teve 20 medições em quatro pessoas sob iluminação controlada. O erro padrão de 1,08 bpm relatado é uma estatística daquele estudo, não uma promessa de precisão por leitura e não valida esta reescrita.

Movimento, iluminação, compressão, harmônicos e características da câmera e da pele podem produzir sinais ou artefatos periódicos. O indicador de periodicidade não é uma probabilidade de precisão. A aplicação é uma demonstração educacional experimental; não use suas estimativas para decisões de saúde. Os testes sintéticos verificam o comportamento do software, não precisão clínica.

Leia [a arquitetura](docs/architecture.md) e os [créditos e licenças de terceiros](THIRD_PARTY_NOTICES.md). O novo código Rust/web usa [licença MIT](LICENSE).

## English

A 2015 undergraduate research project, published in 2016, revisited with Rust and WebAssembly. The bilingual site includes a local camera/video experiment, manual forehead selection, independent color magnification and clearly labeled synthetic data. All processing stays on the device. The shared Rust core powers the browser and Tauri desktop app. This is an educational demonstration, not a validated medical device; the historical study does not validate the new implementation.
