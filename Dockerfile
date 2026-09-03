FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
ENV DATABASE_URL=postgresql://aios:aios@localhost:5432/aios?schema=public
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./dist/generated
COPY --from=build /app/generated ./generated
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
