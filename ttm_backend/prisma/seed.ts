import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const modules = ['USERS', 'ROLES', 'TEAMS', 'TASKS', 'REPORTS'];
  const actions = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE'];

  const permissions = [];
  for (const module of modules) {
    for (const action of actions) {
      const permission = await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: {},
        create: { module, action },
      });
      permissions.push(permission);
    }
  }

  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: {
      name: 'SUPER_ADMIN',
      description: 'System owner with unrestricted permissions',
      isSystem: true,
    },
  });

  await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Manages managers, organizational hierarchy, and overall site operations',
      isSystem: true,
    },
  });

  await prisma.role.upsert({
    where: { name: 'MANAGER' },
    update: {},
    create: {
      name: 'MANAGER',
      description: 'Manages team leads and operational team structures',
      isSystem: true,
    },
  });

  await prisma.role.upsert({
    where: { name: 'TEAM_LEAD' },
    update: {},
    create: {
      name: 'TEAM_LEAD',
      description: 'Manages team members and daily task allocations',
      isSystem: true,
    },
  });

  await prisma.role.upsert({
    where: { name: 'TEAM_MEMBER' },
    update: {},
    create: {
      name: 'TEAM_MEMBER',
      description: 'Executes assigned tasks and submits performance updates',
      isSystem: true,
    },
  });

  // Seed role permission mappings
  const rolePermissionsMap: Record<string, { module: string; action: string }[]> = {
    ADMIN: [
      { module: 'USERS', action: 'CREATE' },
      { module: 'USERS', action: 'READ' },
      { module: 'USERS', action: 'UPDATE' },
      { module: 'USERS', action: 'DELETE' },
      { module: 'USERS', action: 'MANAGE' },
      { module: 'ROLES', action: 'READ' },
      { module: 'ROLES', action: 'MANAGE' },
      { module: 'TEAMS', action: 'READ' },
      { module: 'TEAMS', action: 'CREATE' },
      { module: 'TEAMS', action: 'UPDATE' },
      { module: 'TEAMS', action: 'DELETE' },
      { module: 'TASKS', action: 'CREATE' },
      { module: 'TASKS', action: 'READ' },
      { module: 'TASKS', action: 'UPDATE' },
      { module: 'TASKS', action: 'DELETE' },
      { module: 'REPORTS', action: 'READ' },
    ],
    MANAGER: [
      { module: 'USERS', action: 'CREATE' },
      { module: 'USERS', action: 'READ' },
      { module: 'USERS', action: 'UPDATE' },
      { module: 'USERS', action: 'DELETE' },
      { module: 'ROLES', action: 'READ' },
      { module: 'TEAMS', action: 'CREATE' },
      { module: 'TEAMS', action: 'READ' },
      { module: 'TEAMS', action: 'UPDATE' },
      { module: 'TEAMS', action: 'DELETE' },
      { module: 'TASKS', action: 'CREATE' },
      { module: 'TASKS', action: 'READ' },
      { module: 'TASKS', action: 'UPDATE' },
      { module: 'TASKS', action: 'DELETE' },
      { module: 'REPORTS', action: 'READ' },
    ],
    TEAM_LEAD: [
      { module: 'USERS', action: 'CREATE' },
      { module: 'USERS', action: 'READ' },
      { module: 'USERS', action: 'UPDATE' },
      { module: 'ROLES', action: 'READ' },
      { module: 'TEAMS', action: 'READ' },
      { module: 'TASKS', action: 'CREATE' },
      { module: 'TASKS', action: 'READ' },
      { module: 'TASKS', action: 'UPDATE' },
      { module: 'TASKS', action: 'DELETE' },
      { module: 'REPORTS', action: 'READ' },
    ],
    TEAM_MEMBER: [
      { module: 'USERS', action: 'READ' },
      { module: 'USERS', action: 'UPDATE' },
      { module: 'TEAMS', action: 'READ' },
      { module: 'TASKS', action: 'READ' },
      { module: 'TASKS', action: 'UPDATE' },
    ],
  };

  // Seed permissions for SUPER_ADMIN (unrestricted access)
  for (const perm of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: perm.id,
      },
    });
  }

  // Seed permissions for other roles
  const roleNames = Object.keys(rolePermissionsMap);
  for (const name of roleNames) {
    const role = await prisma.role.findUnique({
      where: { name },
    });
    if (!role) continue;

    const allowed = rolePermissionsMap[name];
    for (const item of allowed) {
      const perm = permissions.find(p => p.module === item.module && p.action === item.action);
      if (!perm) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: perm.id,
        },
      });
    }
  }

  const superAdminEmail = 'superadmin@company.local';
  const existingUser = await prisma.user.findUnique({
    where: { email: superAdminEmail },
  });

  if (!existingUser) {
    const passwordHash = await bcrypt.hash('SuperAdminPass123!', 12);
    await prisma.user.create({
      data: {
        name: 'Root Super Admin',
        email: superAdminEmail,
        passwordHash,
        roleId: superAdminRole.id,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });