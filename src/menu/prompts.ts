import {
    checkbox as inquirerCheckbox,
    confirm as inquirerConfirm,
    input as inquirerInput,
    select as inquirerSelect,
} from "@inquirer/prompts";

export interface PromptChoice<T extends string> {
    readonly name: string;
    readonly value: T;
    readonly description?: string;
    readonly disabled?: boolean | string;
    readonly checked?: boolean;
}

export interface SelectPrompt<T extends string> {
    readonly message: string;
    readonly choices: readonly PromptChoice<T>[];
    readonly pageSize?: number;
}

export interface CheckboxPrompt<T extends string> extends SelectPrompt<T> {
    readonly required?: boolean;
}

export interface InputPrompt {
    readonly message: string;
    readonly default?: string;
    readonly validate?: (value: string) => boolean | string;
}

export interface ConfirmPrompt {
    readonly message: string;
    readonly default?: boolean;
}

export interface PromptAdapter {
    select<T extends string>(prompt: SelectPrompt<T>): Promise<T>;
    checkbox<T extends string>(prompt: CheckboxPrompt<T>): Promise<T[]>;
    input(prompt: InputPrompt): Promise<string>;
    confirm(prompt: ConfirmPrompt): Promise<boolean>;
}

export const inquirerPromptAdapter: PromptAdapter = {
    async select<T extends string>(prompt: SelectPrompt<T>): Promise<T> {
        return inquirerSelect<T>({
            message: prompt.message,
            choices: [...prompt.choices],
            pageSize: prompt.pageSize,
        });
    },

    async checkbox<T extends string>(prompt: CheckboxPrompt<T>): Promise<T[]> {
        return inquirerCheckbox<T>({
            message: prompt.message,
            choices: prompt.choices.map((choice) => ({ ...choice })),
            pageSize: prompt.pageSize,
            required: prompt.required,
        });
    },

    input(prompt: InputPrompt): Promise<string> {
        return inquirerInput(prompt);
    },

    confirm(prompt: ConfirmPrompt): Promise<boolean> {
        return inquirerConfirm(prompt);
    },
};
