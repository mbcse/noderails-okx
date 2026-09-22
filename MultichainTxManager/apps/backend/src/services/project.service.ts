import { prisma } from "../config/database.js";
import { generateApiKey } from "../lib/crypto.js";
import { NotFoundError } from "../lib/errors.js";

// ────────────────────────────────────────────────────────────
// Project service
// ────────────────────────────────────────────────────────────

export const projectService = {
  async list() {
    return prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            chains: true,
            signerKeys: true,
            transactions: true,
            webhookEndpoints: true,
          },
        },
      },
    });
  },

  async getById(id: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            chains: true,
            signerKeys: true,
            transactions: true,
            webhookEndpoints: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundError("Project");
    return project;
  },

  async getByApiKey(apiKey: string) {
    const project = await prisma.project.findUnique({
      where: { apiKey },
    });
    if (!project || !project.isActive) return null;
    return project;
  },

  async create(data: { name: string; description?: string }) {
    return prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        apiKey: generateApiKey(),
      },
    });
  },

  async update(
    id: string,
    data: { name?: string; description?: string; isActive?: boolean },
  ) {
    return prisma.project.update({ where: { id }, data });
  },

  async delete(id: string) {
    await prisma.project.delete({ where: { id } });
  },

  async regenerateApiKey(id: string) {
    const newKey = generateApiKey();
    await prisma.project.update({
      where: { id },
      data: { apiKey: newKey },
    });
    return { apiKey: newKey };
  },
};
