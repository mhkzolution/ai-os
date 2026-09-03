import { Role } from '../../../generated/prisma/enums';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
};
