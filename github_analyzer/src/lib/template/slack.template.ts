export enum BlockType {
    Header = "header",
    Section = "section",
    Divider = "divider",
    Actions = "actions",
    Context = "context",
    Input = "input",
    Image = "image",
    File = "file"
}

export enum TextType {
    PlainText = "plain_text",
    Markdown = "mrkdwn"
}

export type Text = {
    type: TextType;
    text: string;
}

export type Element = Text[];

export type Block = {
    type: BlockType;
    elements?: Text[];
    text?: Text;
}

export type Template = {
    blocks: Block[];
}

function wrapInText(type: TextType, text: string): Text {
    return {
        type,
        text
    };
}

function wrapInBlock(type: BlockType, data: { text: Text } | { elements: Text[] }): Block {
    return {
        type,
        ..."text" in data ? { text: data.text } : undefined,
        ..."elements" in data ? { elements: data.elements } : undefined
    };
}

export class SlackTemplate {
    static getHeader(text: string): Block {
        return wrapInBlock(BlockType.Header, { text: wrapInText(TextType.PlainText, text) });
    }

    static getContext(texts: string[]): Block {
        return wrapInBlock(BlockType.Context, { elements: texts.map(text => wrapInText(TextType.Markdown, text))});
    }

    static getDivider(): Block {
        return { type: BlockType.Divider };
    }

    static getSection(text: string): Block {
        return wrapInBlock(BlockType.Section, { text: wrapInText(TextType.Markdown, text) });
    }
}