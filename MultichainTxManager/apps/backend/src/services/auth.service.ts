import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database.js";
import { config } from "../config/index.js";
import { UnauthorizedError, ConflictError } from "../lib/errors.js";
import type { AdminRole } from "../generated/prisma/client.js";

// ────────────────────────────────────────────────────────────
// Auth service — JWT + bcrypt based admin authentication
// ────────────────────────────────────────────────────────────

interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
}

export const authService = {
  async register(data: {
    email: string;
    password: string;
    name: string;
    role?: AdminRole;
  }) {
    const existing = await prisma.adminUser.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictError("Email already registered");

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.adminUser.create({
      data: {
        email: data.email,
        name: data.name,
        hashedPassword,
        role: data.role ?? "ADMIN",
      },
    });

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  },

  async login(email: string, password: string) {
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedError("Invalid credentials");

    const valid = await bcrypt.compare(password, user.hashedPassword);
    if (!valid) throw new UnauthorizedError("Invalid credentials");

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      algorithm: "HS256",
      expiresIn: config.jwt.expiresIn as any,
      issuer: "mtxm",
      audience: "mtxm-api",
    });

    const refreshToken = jwt.sign(
      { sub: user.id, type: "refresh", ver: user.tokenVersion },
      config.jwt.refreshSecret,
      {
        algorithm: "HS256",
        expiresIn: config.jwt.refreshExpiresIn as any,
        issuer: "mtxm",
        audience: "mtxm-refresh",
      },
    );

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tokens: { accessToken, refreshToken },
    };
  },

  async refresh(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, {
        algorithms: ["HS256"],
        issuer: "mtxm",
        audience: "mtxm-refresh",
      }) as {
        sub: string;
        type: string;
        ver?: number;
      };

      if (decoded.type !== "refresh") {
        throw new UnauthorizedError("Invalid refresh token");
      }

      const user = await prisma.adminUser.findUniqueOrThrow({
        where: { id: decoded.sub },
      });

      // Verify token version — rejects tokens issued before last logout
      if (decoded.ver !== undefined && decoded.ver !== user.tokenVersion) {
        throw new UnauthorizedError("Refresh token has been revoked");
      }

      const payload: TokenPayload = {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };

      const accessToken = jwt.sign(payload, config.jwt.secret, {
        algorithm: "HS256",
        expiresIn: config.jwt.expiresIn as any,
        issuer: "mtxm",
        audience: "mtxm-api",
      });

      const newRefreshToken = jwt.sign(
        { sub: user.id, type: "refresh", ver: user.tokenVersion },
        config.jwt.refreshSecret,
        {
          algorithm: "HS256",
          expiresIn: config.jwt.refreshExpiresIn as any,
          issuer: "mtxm",
          audience: "mtxm-refresh",
        },
      );

      return { accessToken, refreshToken: newRefreshToken };
    } catch (err) {
      // Re-throw our own auth errors (e.g. "revoked") as-is
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
  },

  async getProfile(userId: string) {
    const user = await prisma.adminUser.findUniqueOrThrow({
      where: { id: userId },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  },

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.jwt.secret, {
        algorithms: ["HS256"],
        issuer: "mtxm",
        audience: "mtxm-api",
      }) as TokenPayload;
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }
  },

  /** Increment tokenVersion to revoke all existing refresh tokens */
  async logout(userId: string): Promise<void> {
    await prisma.adminUser.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  },
};
