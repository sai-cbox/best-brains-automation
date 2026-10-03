FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
ENV PORT=8091 REPORT_DIR=/data/reports
EXPOSE 8091
HEALTHCHECK --interval=30s CMD node -e "fetch('http://localhost:8091/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
