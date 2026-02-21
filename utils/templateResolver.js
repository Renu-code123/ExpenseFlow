/**
 * Template Resolver Utility
 * Issue #721: Logic for injecting variables into omnichannel templates.
 */

class TemplateResolver {
    /**
     * Resolve all channel templates with provided variables
     */
    resolve(template, variables = {}) {
        const resolved = JSON.parse(JSON.stringify(template.channels));

        for (const channel of Object.keys(resolved)) {
            if (!resolved[channel].enabled) continue;

            for (const field of Object.keys(resolved[channel])) {
                if (typeof resolved[channel][field] === 'string') {
                    resolved[channel][field] = this._replaceTags(resolved[channel][field], variables);
                }
            }
        }

        return resolved;
    }

    /**
     * Simple string interpolation logic
     * Replace {{varName}} with variable value
     */
    _replaceTags(str, variables) {
        return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, tag) => {
            return variables[tag] !== undefined ? variables[tag] : match;
        });
    }

    /**
     * Validate that all required variables are present
     */
    validateVariables(template, variables) {
        const missing = [];
        for (const def of template.variableDefinitions) {
            if (def.required && variables[def.name] === undefined) {
                missing.push(def.name);
            }
        }
        return missing;
    }
}

module.exports = new TemplateResolver();
