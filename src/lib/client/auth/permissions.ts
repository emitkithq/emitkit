import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, ownerAc } from 'better-auth/plugins/organization/access';

// Define our custom resources and actions
const customStatements = {
	billing: ['read', 'update']
} as const;

// Merge with Better Auth default statements
const statement = {
	...defaultStatements, // organization, member, invitation
	...customStatements
} as const;

// Create access control instance
export const ac = createAccessControl(statement);

// Define roles with both default and custom permissions
export const owner = ac.newRole({
	// Better Auth default permissions for owner
	...ownerAc.statements,
	// Our custom permissions
	billing: ['read', 'update']
});

export const admin = ac.newRole({
	// Better Auth default permissions for admin
	...adminAc.statements,
	// Our custom permissions (reduced from owner)
	billing: ['read']
});

export const adminStatements = admin.statements;

export const member = ac.newRole({
	// memberAc.statements.organization - Members have NO organization permissions
	// (deliberately not including)

	// memberAc.statements.member - Members have NO member management permissions
	// (deliberately not including)

	// memberAc.statements.invitation - Members have NO invitation permissions (this prevents inviting)
	// (deliberately not including)

	// memberAc.statements.team - Optionally allow members to create teams
	// (deliberately not including)

	// memberAc.statements.ac - Members have NO access control permissions

	// Our custom permissions (limited)
	billing: []
});

export const viewer = ac.newRole({
	// No default Better Auth permissions for viewer
	// Read-only access to most resources
	billing: []
});

// Export for type inference
export type Permissions = typeof statement;
export type Role = 'owner' | 'admin' | 'member' | 'viewer';
