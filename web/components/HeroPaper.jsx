// A single, carefully typeset page — the actual thing Markus produces.
// Pure CSS (no JS), so it's light and renders identically everywhere. The page
// stays white in both themes (like a real PDF on the dark/light surround).
export default function HeroPaper() {
  return (
    <div className="hero-paper" aria-hidden="true">
      <article className="paper-sheet">
        <header className="ps-head">
          <h2 className="ps-title">On the Calm Geometry of Writing</h2>
          <p className="ps-authors">Markus&nbsp;Studio</p>
          <p className="ps-affil">Markdown in · LaTeX out</p>
        </header>

        <section className="ps-abstract">
          <span className="ps-abs-label">Abstract</span>
          We argue that authors write best when the tools disappear. A plain
          source compiles to typographically exact output — equations, figures and
          references included — without leaving the keyboard.
        </section>

        <div className="ps-cols">
          <div className="ps-col">
            <h3 className="ps-h">1&nbsp;&nbsp;Introduction</h3>
            <p className="ps-p">
              Markdown is read; LaTeX is set. Markus keeps the ease of the former
              and the craft of the latter, so a note and a manuscript share one
              grammar.
            </p>
            <div className="ps-eq">
              <span className="ps-eq-body">
                <i>L</i>(<i>θ</i>) = <span className="ps-sum">∑</span>
                <sub>i</sub> ℓ(<i>y</i><sub>i</sub>, <i>f</i>(<i>x</i><sub>i</sub>;&thinsp;<i>θ</i>))
              </span>
              <span className="ps-eq-num">(1)</span>
            </div>
            <p className="ps-p">
              Equation (1) defines the loss minimised over a corpus of documents.
            </p>
          </div>

          <div className="ps-col">
            <figure className="ps-fig">
              <svg viewBox="0 0 120 64" className="ps-chart" preserveAspectRatio="none">
                <path d="M2 60 C 30 58, 38 16, 60 14 S 96 8, 118 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <line x1="2" y1="62" x2="118" y2="62" stroke="currentColor" strokeWidth="0.6" opacity="0.5" />
              </svg>
              <figcaption>Figure 1: Effort falls as the source stays simple.</figcaption>
            </figure>
            <h3 className="ps-h">References</h3>
            <ol className="ps-refs">
              <li>Knuth, D. <i>Literate Programming.</i> 1984.</li>
              <li>Lamport, L. <i>LaTeX.</i> 1994.</li>
            </ol>
          </div>
        </div>

        <footer className="ps-foot"><span>1</span></footer>
      </article>
    </div>
  );
}
