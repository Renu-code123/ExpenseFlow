const Team = require('../models/Team');
const User = require('../models/User');

class TeamManagementService {
    /**
     * Create a new team
     */
    async createTeam(adminId, teamData) {
        const team = new Team({
            ...teamData,
            manager: adminId
        });
        await team.save();
        return team;
    }

    /**
     * Add member to team
     */
    async addMember(teamId, userId, role = 'member') {
        const team = await Team.findById(teamId);
        if (!team) throw new Error('Team not found');

        const isAlreadyMember = team.members.some(m => m.user.toString() === userId.toString());
        if (isAlreadyMember) throw new Error('User is already a member of this team');

        team.members.push({ user: userId, role });
        await team.save();

        // Update user role if necessary
        const user = await User.findById(userId);
        if (user && role === 'manager' && user.role === 'submitter') {
            user.role = 'approver';
            await user.save();
        }

        return team;
    }

    /**
     * Remove member from team
     */
    async removeMember(teamId, userId) {
        const team = await Team.findById(teamId);
        if (!team) throw new Error('Team not found');

        team.members = team.members.filter(m => m.user.toString() !== userId.toString());
        await team.save();
        return team;
    }

    /**
     * Get user's team hierarchy
     */
    async getHierarchy(userId) {
        const teams = await Team.find({ 'members.user': userId }).populate('manager', 'name email');
        return teams;
    }

    /**
     * Update team settings
     */
    async updateTeam(teamId, updateData) {
        return await Team.findByIdAndUpdate(teamId, updateData, { new: true });
    }
}

module.exports = new TeamManagementService();
