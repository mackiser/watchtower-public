import { PrismaClient } from "../../prisma/generated/index.js";

// Single shared Prisma client instance for the whole process.
export const prisma = new PrismaClient();
