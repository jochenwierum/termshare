import {defineConfig, globalIgnores} from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig(
    globalIgnores(["build", "dist"]),
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        "rules": {
            "semi": "error",
            "no-unreachable": "warn",
            "no-unexpected-multiline": "warn",
            "quotes": [
                "warn",
                "double",
                {
                    "avoidEscape": true,
                    "allowTemplateLiterals": true
                }
            ],
            "no-control-regex": 0,
        }
    }
);
