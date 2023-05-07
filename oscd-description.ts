import {
  css,
  html,
  LitElement,
  nothing,
  PropertyValues,
  TemplateResult,
} from 'lit';

import { property, query, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';

import '@material/mwc-button';
import '@material/mwc-formfield';
import '@material/mwc-textfield';
import '@material/mwc-list';
import '@material/mwc-list/mwc-list-item';
import '@material/mwc-list/mwc-radio-list-item';
import '@material/mwc-icon-button-toggle';
import '@material/mwc-icon';

import { newEditEvent, Update } from '@openscd/open-scd-core';

import type { TextField } from '@material/mwc-textfield';
// import type { IconButton } from '@material/mwc-icon-button';
import type { IconButtonToggle } from '@material/mwc-icon-button-toggle';

import { identity } from './foundation/identities/identity.js';
import { selector } from './foundation/identities/selector.js';

import './foundation/components/oscd-filter-button.js';

import {
  compareNames,
  getDescriptionAttribute,
  getNameAttribute,
} from './foundation/foundation.js';

import { styles } from './foundation/styles/styles.js';

import type { SelectedItemsChangedEvent } from './foundation/components/oscd-filter-button.js';

// import { translate } from 'lit-translate';

function debounce(callback: any, delay = 250) {
  let timeout: any;

  return (...args: any) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}

// update in later binding for changed lnInst with ?? ''
function getFcdaTitleValue(fcdaElement: Element): string {
  return `${fcdaElement.getAttribute('doName') ?? ''}${
    fcdaElement.hasAttribute('doName') && fcdaElement.hasAttribute('daName')
      ? `.`
      : ``
  }${fcdaElement.getAttribute('daName') ?? ''}`;
}

// update in later binding for changed lnInst with ?? ''
export function getFcdaSubtitleValue(fcdaElement: Element): string {
  return `${fcdaElement.getAttribute('ldInst')} ${
    fcdaElement.hasAttribute('ldInst') ? `/` : ''
  }${
    fcdaElement.getAttribute('prefix')
      ? ` ${fcdaElement.getAttribute('prefix')}`
      : ''
  } ${fcdaElement.getAttribute('lnClass') ?? ''} ${
    fcdaElement.getAttribute('lnInst') ?? ''
  }`;
}

function lnPath(childElement: Element): string {
  if (!childElement) return 'Unknown';
  const lN = childElement.closest('LN') ?? childElement.closest('LN0');
  const lDevice = lN!.closest('LDevice');

  const ldInst = lDevice?.getAttribute('inst');
  const lnPrefix = lN?.getAttribute('prefix');
  const lnClass = lN?.getAttribute('lnClass');
  const lnInst = lN?.getAttribute('inst');

  return [ldInst, '/', lnPrefix, lnClass, lnInst]
    .filter(a => a !== null)
    .join(' ');
}

function getInputsElementsByIed(ied: Element): Element[] {
  return Array.from(
    ied.querySelectorAll(
      ':scope > AccessPoint > Server > LDevice > LN > Inputs , :scope > AccessPoint > Server > LDevice > LN0 > Inputs '
    )
  );
}

type FcdaDescriptionText = {
  desc?: string;
  identity: string | number;
  tag: string;
  index?: number;
};

function getFcdaInstDesc(
  fcda: Element,
  includeDai: boolean
): FcdaDescriptionText[] | null {
  const [doName, daName] = ['doName', 'daName'].map(attr =>
    fcda.getAttribute(attr)
  );

  const ied = fcda.closest('IED');

  const anyLn = Array.from(
    ied?.querySelectorAll(
      `LDevice[inst="${fcda.getAttribute(
        'ldInst'
      )}"] > LN, LDevice[inst="${fcda.getAttribute('ldInst')}"] LN0`
    ) ?? []
  ).find(
    lN =>
      (lN.getAttribute('prefix') ?? '') ===
        (fcda.getAttribute('prefix') ?? '') &&
      (lN.getAttribute('lnClass') ?? '') ===
        (fcda.getAttribute('lnClass') ?? '') &&
      (lN.getAttribute('inst') ?? '') === (fcda.getAttribute('lnInst') ?? '')
  );

  if (!anyLn) return null;

  const descs: FcdaDescriptionText[] = [];
  const lD = anyLn!.closest('LDevice');
  descs.push({
    desc: lD?.getAttribute('desc') ?? '',
    identity: identity(lD),
    tag: lD!.tagName,
  });

  descs.push({
    desc: anyLn?.getAttribute('desc') ?? '',
    identity: identity(anyLn!),
    tag: anyLn!.tagName,
  });

  const doNames = doName!.split('.');
  const doi = anyLn!.querySelector(`DOI[name="${doNames[0]}"`);

  if (!doi) return descs;
  descs.push({
    desc: doi?.getAttribute('desc') ?? '',
    identity: identity(doi!),
    tag: doi!.tagName,
  });

  let previousDI: Element = doi!;
  doNames.slice(1).forEach(sdiName => {
    const sdi = previousDI.querySelector(`SDI[name="${sdiName}"]`);
    if (sdi) {
      previousDI = sdi;
      descs.push({
        desc: sdi?.getAttribute('desc') ?? '',
        identity: identity(sdi!),
        tag: sdi!.tagName,
      });
    }
  });

  if (!includeDai || !daName) return descs;

  const daNames = daName?.split('.');
  const dai = (previousDI ?? doi).querySelector(`DAI[name="${daNames[0]}"]`);

  descs.push({
    desc: dai?.getAttribute('desc') ?? '',
    identity: identity(dai!),
    tag: dai!.tagName,
  });

  return descs;
}

/**
 * Editor for GOOSE and SMV supervision LNs
 */
export default class Description extends LitElement {
  @property({ attribute: false })
  doc!: XMLDocument;

  @property() docName!: string;

  @property() editCount!: number;

  @property() controlType: 'GOOSE' | 'SMV' = 'GOOSE';

  @state()
  private get iedList(): Element[] {
    return this.doc
      ? Array.from(this.doc.querySelectorAll(':root > IED')).sort((a, b) =>
          compareNames(a, b)
        )
      : [];
  }

  @state()
  selectedIEDs: string[] = [];

  @state()
  private get selectedIed(): Element | undefined {
    // When there is no IED selected, or the selected IED has no parent (IED has been removed)
    // select the first IED from the List.
    if (this.selectedIEDs.length >= 1) {
      return this.iedList.find(element => {
        const iedName = getNameAttribute(element);
        return this.selectedIEDs[0] === iedName;
      });
    }
    return undefined;
  }

  @query('section.dataset')
  dataSetSectionUI!: HTMLElement;

  @query('#datasetSectionExpander')
  dataSetExpanderButtonUI!: IconButtonToggle;

  @query('section.extref')
  extRefSectionUI!: HTMLElement;

  @query('#extrefSectionExpander')
  extRefExpanderButtonUI!: IconButtonToggle;

  @property()
  anyDataSetExpanded: boolean = false;

  @property()
  anyExtRefSectionExpanded: boolean = false;

  protected updated(_changedProperties: PropertyValues): void {
    super.updated(_changedProperties);

    // When the document is updated, we reset the selected IED.
    // TODO: Detect same document opened twice. Howto?
    if (_changedProperties.has('doc')) {
      this.selectedIEDs = [];

      if (this.iedList.length > 0) {
        const iedName = getNameAttribute(this.iedList[0]);
        if (iedName) {
          this.selectedIEDs = [iedName];
        }
      }
    }

    if (_changedProperties.has('selectedIed') && this.selectedIed) {
      // this.updateControlBlockInfo();
    }
  }

  private renderIedSelector(): TemplateResult {
    return html`<div id="iedSelector">
      <oscd-filter-button
        id="iedFilter"
        icon="developer_board"
        header="IED Selector"
        @selected-items-changed="${(e: SelectedItemsChangedEvent) => {
          this.selectedIEDs = e.detail.selectedItems;
          this.requestUpdate('selectedIed');
        }}"
      >
        ${this.iedList.map(ied => {
          const name = getNameAttribute(ied) ?? 'Unknown Name';
          const descr = getDescriptionAttribute(ied);
          const type = ied.getAttribute('type');
          const manufacturer = ied.getAttribute('manufacturer');
          return html` <mwc-radio-list-item
            value="${name}"
            ?twoline="${!!(type && manufacturer)}"
            ?selected="${this.selectedIEDs?.includes(name ?? '')}"
          >
            ${name} ${descr ? html` (${descr})` : html``}
            <span slot="secondary">
              ${type} ${type && manufacturer ? html`&mdash;` : nothing}
              ${manufacturer}
            </span>
          </mwc-radio-list-item>`;
        })}
      </oscd-filter-button>
      <h2>
        ${this.selectedIed
          ? getNameAttribute(this.selectedIed)
          : 'No IED Selected'}
        (${this.selectedIed?.getAttribute('type') ?? 'Unknown Type'})
      </h2>
    </div>`;
  }

  protected updateExtRefSectionExpanded(): void {
    if (!this.extRefSectionUI.querySelector('.open')) {
      this.anyExtRefSectionExpanded = false;
    } else {
      this.anyExtRefSectionExpanded = true;
    }
    this.extRefExpanderButtonUI.on = this.anyExtRefSectionExpanded;
  }

  protected updateDatasetSectionExpanded(): void {
    if (!this.dataSetSectionUI.querySelector('.open')) {
      this.anyDataSetExpanded = false;
    } else {
      this.anyDataSetExpanded = true;
    }
    this.dataSetExpanderButtonUI.on = this.anyDataSetExpanded;
  }

  protected renderDataSetFcdas(ds: Element): TemplateResult {
    return html`${Array.from(ds.querySelectorAll('FCDA')).map(fcda => {
      const fcdatitle = `${getFcdaSubtitleValue(fcda)} ${getFcdaTitleValue(
        fcda
      )}`;
      const fcdaDescs = getFcdaInstDesc(fcda, false);

      if (!fcdaDescs)
        return html`<div class="grouper">
          <div class="title col">
            <p>${fcdatitle}</p>
          </div>
          <p class="col">${msg('FCDA is incorrectly defined')}</p>
        </div>`;

      return html`
        <div class="grouper">
          <div class="title col"><p>${fcdatitle}</p></div>
          ${fcdaDescs.map(
            desc => html`<mwc-textfield
              class="col"
              label="${desc.tag}"
              value="${desc.desc}"
              data-id="${desc.identity}"
              data-tag="${desc.tag}"
              @input=${(ev: Event) => this.onFieldInput(ev.target)}
            >
              ></mwc-textfield
            >`
          )}
        </div>
      `;
    })}`;
  }

  protected renderDataSetHeader(): TemplateResult {
    return html`<h1>
      Datasets<mwc-icon-button-toggle
        id="datasetSectionExpander"
        onIcon="expand_less"
        offIcon="expand_more"
        @icon-button-toggle-change=${(ev: CustomEvent) => {
          if (ev.target) {
            const collapseItems = (<HTMLElement>ev.target)
              .closest('section')
              ?.querySelectorAll('div.collapse');

            const { isOn } = ev.detail;

            this.anyDataSetExpanded = isOn;

            // expand/collapse each section
            collapseItems?.forEach(item => {
              const button = <IconButtonToggle>item.querySelector('.toggle');
              if (!button) return;
              if (!isOn) {
                if (item.classList.contains('open'))
                  item.classList.remove('open');
                (<IconButtonToggle>button).on = false;
              } else {
                item.classList.add('open');
                (<IconButtonToggle>button).on = true;
              }

              // textfields if changing from display: none need layout to be called
              item.querySelectorAll('mwc-textfield').forEach(tf => tf.layout());
            });

            this.requestUpdate();
          }
        }}
      ></mwc-icon-button-toggle>
    </h1>`;
  }

  protected renderDataSets(): TemplateResult {
    const datasets = Array.from(
      this.doc.querySelectorAll(
        `IED[name="${
          this.selectedIed?.getAttribute('name') ?? 'Unknown'
        }"] DataSet`
      )
    );
    return html`<section class="dataset">
      ${this.renderDataSetHeader()}
      ${Array.from(datasets).map(ds => {
        const lN = ds.closest('LN') ?? ds.closest('LN0');
        return html` <div class="collapse">
          <div class="collapse-header" data-id="${identity(ds)}">
            <h3 class="group-title">
              <mwc-icon-button-toggle
                class="toggle"
                onIcon="unfold_less"
                offIcon="unfold_more"
                @icon-button-toggle-change=${(ev: CustomEvent) => {
                  if (ev.target) {
                    const collapse = (<HTMLElement>ev.target).closest(
                      '.collapse'
                    );
                    if (collapse) {
                      collapse.classList.toggle('open');

                      // textfields if changing from display: none need layout to be called
                      collapse
                        .querySelectorAll('mwc-textfield')
                        .forEach(tf => tf.layout());
                    }
                    this.updateDatasetSectionExpanded();
                    this.requestUpdate();
                  }
                }}
              ></mwc-icon-button-toggle>
              ${lnPath(ds)} > ${ds.getAttribute('name')}
            </h3>
            <div class="col title group-title">
              ${this.renderTextField(lN!, 'LN')}
              ${this.renderTextField(ds!, 'DataSet')}
            </div>
          </div>
          <div class="collapse-content">${this.renderDataSetFcdas(ds)}</div>
        </div>`;
      })}
    </section>`;
  }

  protected renderInputExtRefs(inputs: Element): TemplateResult {
    return html`${Array.from(inputs.querySelectorAll('ExtRef')).map(
      extRef => html`<div class="grouper-extref">
        <p class="col-extref title">${extRef.getAttribute('intAddr')}</p>
        ${this.renderTextField(extRef)}
      </div>`
    )}`;
  }

  protected renderExtRefsHeader(): TemplateResult {
    return html`<h1>
      External References
      <mwc-icon-button-toggle
        id="extrefSectionExpander"
        onIcon="expand_less"
        offIcon="expand_more"
        @icon-button-toggle-change=${(ev: CustomEvent) => {
          if (ev.target) {
            const collapseItems = (<HTMLElement>ev.target)
              .closest('section')
              ?.querySelectorAll('div.collapse');

            const { isOn } = ev.detail;

            this.anyExtRefSectionExpanded = isOn;

            collapseItems?.forEach(item => {
              const button = <IconButtonToggle>item.querySelector('.toggle');
              if (!button) return;
              if (!isOn) {
                if (item.classList.contains('open'))
                  item.classList.remove('open');
                (<IconButtonToggle>button).on = false;
              } else {
                item.classList.add('open');
                (<IconButtonToggle>button).on = true;
              }
              item.querySelectorAll('mwc-textfield').forEach(tf => tf.layout());
            });
            this.requestUpdate();
          }
        }}
      ></mwc-icon-button-toggle>
    </h1>`;
  }

  protected renderTextField(
    sclElement: Element,
    label = 'desc'
  ): TemplateResult {
    return html`<mwc-textfield
      outlined
      class="col title"
      label="${label}"
      value="${sclElement.getAttribute('desc') ?? ''}"
      data-id="${identity(sclElement)}"
      data-tag="${sclElement.tagName}"
      @input=${(ev: Event) => this.onFieldInput(ev.target)}
    >
      ></mwc-textfield
    >`;
  }

  protected renderExtRefs(): TemplateResult {
    return html`<section class="extref">
      ${this.renderExtRefsHeader()}
      ${getInputsElementsByIed(this.selectedIed!).map(input => {
        const lN = input.closest('LN') ?? input.closest('LN0');
        return html`<div class="collapse">
          <div class="collapse-header" data-id="${identity(input)}">
            <h3 class="group-title">
              <mwc-icon-button-toggle
                class="toggle"
                onIcon="unfold_less"
                offIcon="unfold_more"
                @icon-button-toggle-change=${(ev: CustomEvent) => {
                  if (ev.target) {
                    const collapse = (<HTMLElement>ev.target).closest(
                      '.collapse'
                    );
                    if (collapse) collapse.classList.toggle('open');
                    this.requestUpdate();
                  }
                  this.updateExtRefSectionExpanded();

                  const collapseItem = (<HTMLElement>ev.target)
                    .closest('div.collapse')
                    ?.querySelector('div.collapse-content');

                  if (collapseItem)
                    collapseItem
                      .querySelectorAll('mwc-textfield')
                      .forEach(tf => tf.layout());
                }}
              ></mwc-icon-button-toggle>
              ${lnPath(input)} > Inputs
            </h3>
            <div class="col title group-title">
              ${this.renderTextField(lN!, 'LN')}
              ${this.renderTextField(input, 'Inputs')}
            </div>
          </div>
          <div class="collapse-content">${this.renderInputExtRefs(input)}</div>
        </div>`;
      })}
    </section>`;
  }

  protected render(): TemplateResult {
    if (!this.doc || !this.selectedIed)
      return html`<h1>${msg('No IEDs present')}</h1>`;

    return html`<div id="controlSection">${this.renderIedSelector()}</div>
      ${this.renderDataSets()}${this.renderExtRefs()}`;
  }

  onFieldInput = debounce((target: HTMLElement) => {
    const { value } = <TextField>target;
    const { id, tag } = (<TextField>target)!.dataset;
    if (!id || !tag) return;
    const sclElement: Element | undefined =
      this.doc.querySelector(selector(tag ?? 'Unknown', id ?? 'Unknown')) ??
      undefined;

    if (sclElement) {
      const edit: Update = {
        element: sclElement,
        attributes: { desc: value },
      };
      this.dispatchEvent(newEditEvent(edit));
      this.requestUpdate();
    }
  }, 300);

  static styles = css`
    ${styles}

    :host {
      width: 100vw;
      height: 100vh;
    }

    h1,
    h2,
    h3,
    p {
      color: var(--mdc-theme-on-surface);
      font-family: 'Roboto', sans-serif;
      font-weight: 300;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      margin: 0px;
      line-height: 48px;
      padding-left: 0.3em;
      transition: background-color 150ms linear;
      min-width: 300px;
      max-width: 500px;
    }

    #iedSelector {
      display: inline-flex;
      padding-left: 20px;
    }

    #iedFilter {
      --mdc-icon-size: 32px;
    }

    section {
      display: block;
      padding: 20px;
    }

    .grouper {
      display: flex;
      width: 100%;
      align-items: center;
      padding-left: 20px;
    }

    .grouper-extref {
      display: flex;
      width: 50%%;
      align-items: center;
      padding-left: 20px;
    }

    .col {
      flex: 1 1 25%;
      padding: 10px;
      max-width: 400px;
    }

    .col-extref {
      max-width: 400px;
      flex: 1 1 0px;
      padding: 10px;
    }

    .title {
      flex: 0 0 350px;
      padding-left: 10px;
    }

    /* h3 {
      font-weight: 500;
    } */

    .collapse-content {
      display: none;
    }

    .collapse.open .collapse-content {
      display: block;
    }

    .group-title {
      display: inline-flex;
      align-items: center;
    }
  `;
}
