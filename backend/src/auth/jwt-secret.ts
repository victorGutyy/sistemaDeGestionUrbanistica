if (!process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en las variables de entorno');
}

export const JWT_SECRET: string = process.env.JWT_SECRET;
