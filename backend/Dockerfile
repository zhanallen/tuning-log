FROM node:20-alpine

WORKDIR /app

# Install openssl and other prisma dependencies for Alpine
RUN apk add --no-cache openssl direnv libc6-compat

COPY package*.json ./

RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 5000

# We will run migrations, seed the DB, and start the app using a entrypoint command in compose or directly
CMD ["npm", "run", "start"]
