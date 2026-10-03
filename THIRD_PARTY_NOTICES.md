# Attribution and scope of licenses

The 2026 Rust implementation and web interface are independently written and released under the root MIT license. Dependency packages retain their own licenses; their exact versions are recorded in Cargo.lock and package-lock.json.

The code in `legacy/` is the historical 2015 project. The bundled `legacy/cascades/haarcascade_frontalface_alt.xml` carries Intel/OpenCV's original license and Rainer Lienhart attribution inside the file; retain that notice. This detector is not included in the new web or desktop application. No MIT research source code or demonstration video is redistributed.

The historical C++ profiler and utility files do not contain complete upstream provenance notices. The MIT license above is scoped to the independently written 2026 implementation; it is not a claim that those legacy utilities or all files in older Git commits have been relicensed.

Scientific inspiration: Wu, H.-Y., Rubinstein, M., Shih, E., Guttag, J., Durand, F., and Freeman, W. (2012). Eulerian Video Magnification for Revealing Subtle Changes in the World. ACM Transactions on Graphics, 31(4). DOI: https://doi.org/10.1145/2185520.2185561. The MIT project's own distributed code has research-use conditions; our license does not change those conditions.

Historical publication: Rodrigues, K. A. S., Pereira, M. H. R., and Pádua, F. L. C. (2016). Detecção em tempo real da frequência cardíaca de pessoas por meio da análise de variações temporais em vídeos. e-xacta, 9(1), 49–62. DOI: https://doi.org/10.18674/exacta.v9i1.1666. Linked, not republished.
