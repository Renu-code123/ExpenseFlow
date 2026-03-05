const Project = require('../models/Project');
const ProjectCosting = require('../models/ProjectCosting');

class ProjectService {
    async createProject(userId, projectData) {
        const project = new Project({
            ...projectData,
            userId
        });
        return await project.save();
    }

    async getProjects(userId, filters = {}) {
        const query = { userId };
        if (filters.status) query.status = filters.status;
        if (filters.priority) query.priority = filters.priority;
        return await Project.find(query).sort({ createdAt: -1 });
    }

    async getProjectById(userId, projectId) {
        return await Project.findOne({ _id: projectId, userId });
    }

    async updateProject(userId, projectId, updateData) {
        return await Project.findOneAndUpdate(
            { _id: projectId, userId },
            { $set: updateData },
            { new: true }
        );
    }

    async deleteProject(userId, projectId) {
        await ProjectCosting.deleteMany({ projectId, userId });
        return await Project.findOneAndDelete({ _id: projectId, userId });
    }

    async getProjectStats(userId) {
        const projects = await Project.find({ userId });
        const stats = {
            total: projects.length,
            active: projects.filter(p => p.status === 'active').length,
            completed: projects.filter(p => p.status === 'completed').length,
            planning: projects.filter(p => p.status === 'planning').length,
            onHold: projects.filter(p => p.status === 'on_hold').length,
            totalBudget: projects.reduce((sum, p) => sum + (p.budget?.total || 0), 0)
        };
        return stats;
    }
}

module.exports = new ProjectService();
