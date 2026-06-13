# Markus Studio — full app image: Next.js web + Python markus engine + LaTeX.
# Render (or any container host) builds this; the PDF compiler works because
# Python and a LaTeX toolchain are installed here.
FROM node:20-bookworm-slim

# ---- system: Python + LaTeX (latexmk/pdflatex) for compiling .mks -> PDF ----
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv \
      latexmk \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-fonts-recommended \
      texlive-science \
      texlive-plain-generic \
      lmodern \
      ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- install the Python markus CLI into an isolated venv ----
COPY pyproject.toml README.md ./
COPY src ./src
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir .
ENV PATH="/opt/venv/bin:${PATH}"
ENV MARKUS_BIN="/opt/venv/bin/markus"

# ---- build the Next.js web app ----
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npm run build

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 4400

# Render injects $PORT; bind it (fallback 4400 for local docker run)
CMD ["sh", "-c", "cd web && npx next start -p ${PORT:-4400} -H 0.0.0.0"]
