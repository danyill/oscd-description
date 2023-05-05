import { LitElement, PropertyValues, TemplateResult } from 'lit';
import '@material/mwc-button';
import '@material/mwc-formfield';
import '@material/mwc-textfield';
import '@material/mwc-list';
import '@material/mwc-list/mwc-list-item';
import '@material/mwc-list/mwc-radio-list-item';
import '@material/mwc-icon-button-toggle';
import '@material/mwc-icon';
import '@material/mwc-icon-button';
import './foundation/components/oscd-filter-button.js';
export declare function getFcdaSubtitleValue(fcdaElement: Element): string;
/**
 * Editor for GOOSE and SMV supervision LNs
 */
export default class Supervision extends LitElement {
    doc: XMLDocument;
    docName: string;
    editCount: number;
    controlType: 'GOOSE' | 'SMV';
    private get iedList();
    selectedIEDs: string[];
    private get selectedIed();
    protected firstUpdated(): void;
    protected updated(_changedProperties: PropertyValues): void;
    private renderIedSelector;
    protected render(): TemplateResult;
    onFieldInput: (...args: any) => void;
    static styles: import("lit").CSSResult;
}
