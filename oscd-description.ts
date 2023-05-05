import {
  css,
  html,
  LitElement,
  nothing,
  PropertyValues,
  TemplateResult,
} from 'lit';

import { property, state } from 'lit/decorators.js';

import '@material/mwc-button';
import '@material/mwc-formfield';
import '@material/mwc-textfield';
import '@material/mwc-list';
import '@material/mwc-list/mwc-list-item';
import '@material/mwc-list/mwc-radio-list-item';
import '@material/mwc-icon-button-toggle';
import '@material/mwc-icon';
import '@material/mwc-icon-button';

import { newEditEvent, Update } from '@openscd/open-scd-core';

import type { TextField } from '@material/mwc-textfield';

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

function getFcdaTitleValue(fcdaElement: Element): string {
  return `${fcdaElement.getAttribute('doName')}${
    fcdaElement.hasAttribute('doName') && fcdaElement.hasAttribute('daName')
      ? `.`
      : ``
  }${fcdaElement.getAttribute('daName') ?? ''}`;
}

export function getFcdaSubtitleValue(fcdaElement: Element): string {
  return `${fcdaElement.getAttribute('ldInst')} ${
    fcdaElement.hasAttribute('ldInst') ? `/` : ''
  }${
    fcdaElement.getAttribute('prefix')
      ? ` ${fcdaElement.getAttribute('prefix')}`
      : ''
  } ${fcdaElement.getAttribute('lnClass')} ${fcdaElement.getAttribute(
    'lnInst'
  )}`;
}

function extRefPath(extRef: Element): string {
  if (!extRef) return 'Unknown';
  const lN = extRef.closest('LN') ?? extRef.closest('LN0');
  const lDevice = lN!.closest('LDevice');

  const ldInst = lDevice?.getAttribute('inst');
  const lnPrefix = lN?.getAttribute('prefix');
  const lnClass = lN?.getAttribute('lnClass');
  const lnInst = lN?.getAttribute('inst');

  return [ldInst, '/', lnPrefix, lnClass, lnInst]
    .filter(a => a !== null)
    .join(' ');
}

function getExtRefElementsByIED(ied: Element): Element[] {
  return Array.from(
    ied.querySelectorAll(
      ':scope > AccessPoint > Server > LDevice > LN > Inputs > ExtRef, :scope > AccessPoint > Server > LDevice > LN0 > Inputs > ExtRef'
    )
  );
}

type fcdaInfo = 'lD' | 'lN' | 'dOI' | 'sDI' | 'dAI';

type FcdaDescriptionText = {
  [key in fcdaInfo]?: {
    desc?: string;
    identity: string | number;
    tag: string;
  };
};

function getFcdaInstDesc(
  fcda: Element,
  includeDai: boolean
): FcdaDescriptionText | null {
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

  let descs: FcdaDescriptionText;
  const lD = anyLn.closest('LDevice');
  descs = {
    lD: {
      desc: lD?.getAttribute('desc') ?? '',
      identity: identity(lD),
      tag: lD!.tagName,
    },
  };

  const lnDesc = anyLn.getAttribute('desc');
  descs = {
    ...descs,
    lN: {
      ...(lnDesc && { desc: lnDesc }),
      identity: identity(anyLn),
      tag: anyLn!.tagName,
    },
  };

  const doNames = doName!.split('.');
  const doi = anyLn.querySelector(`DOI[name="${doNames[0]}"`);
  const doiDesc = doi?.getAttribute('desc');
  descs = {
    ...descs,
    dOI: {
      ...(doiDesc && { desc: doiDesc }),
      identity: identity(doi),
      tag: doi!.tagName,
    },
  };

  let previousDI: Element = doi!;
  doNames.slice(1).forEach(sdiName => {
    const sdi = previousDI.querySelector(`SDI[name="${sdiName}"]`);
    if (sdi) previousDI = sdi;
    const sdiDesc = sdi?.getAttribute('desc');
    descs = {
      ...descs,
      sDI: {
        ...(sdiDesc && { desc: sdiDesc }),
        identity: identity(sdi),
        tag: sdi!.tagName,
      },
    };
  });

  if (!includeDai || !daName) return descs;

  const daNames = daName?.split('.');
  const dai = (previousDI ?? doi).querySelector(`DAI[name="${daNames[0]}"]`);
  const daiDesc = dai?.getAttribute('desc');
  descs = {
    ...descs,
    dAI: {
      ...(daiDesc && { desc: daiDesc }),
      identity: identity(dai),
      tag: dai!.tagName,
    },
  };

  return descs;
}

/**
 * Editor for GOOSE and SMV supervision LNs
 */
export default class Supervision extends LitElement {
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

  protected firstUpdated(): void {
    // this.updateControlBlockInfo();
  }

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

  protected render(): TemplateResult {
    if (!this.doc || !this.selectedIed) return html``;

    // if (!this.selectedIed) return html`<h1>No IEDs present</h1>`;

    const datasets = Array.from(
      this.doc.querySelectorAll(
        `IED[name="${
          this.selectedIed?.getAttribute('name') ?? 'Unknown'
        }"] DataSet`
      )
    );

    // <FCDA ldInst="ANN" prefix="PSV" lnClass="GGIO" lnInst="1" doName="Ind64" daName="stVal" fc="ST"/>

    const labels: Partial<Record<string, string>> = {
      lD: 'Logical Device',
      lN: 'Logical Node',
      dOI: 'Data Object',
      sDO: 'Sub Data Object',
      dA: 'Data Attribute',
    };

    const usedInfo: Partial<fcdaInfo>[] = ['lD', 'lN', 'dOI'];

    return html`<div id="controlSection">${this.renderIedSelector()}</div>
      <section>
        <h1>Datasets</h1>
        ${Array.from(datasets).map(
          ds =>
            // <FCDA ldInst="ANN" prefix="PSV" lnClass="GGIO" lnInst="1" doName="Ind64" daName="stVal" fc="ST"/>

            html`
              <h3>${ds.getAttribute('name')}</h3>

              ${Array.from(ds.querySelectorAll('FCDA')).map(fcda => {
                const fcdatitle = `${getFcdaSubtitleValue(
                  fcda
                )} ${getFcdaTitleValue(fcda)}`;
                const descriptions = getFcdaInstDesc(fcda, false);

                return html`
                  <div class="grouper">
                    <div class="title col"><p>${fcdatitle}</p></div>
                    ${
                      descriptions
                        ? usedInfo.map(
                            descType =>
                              html`<mwc-textfield
                                class="col rounded"
                                label="${labels[descType]}"
                                outlined
                                value="${descriptions[descType]?.desc ?? ''}"
                                data-id="${descriptions[descType]?.identity}"
                                data-tag="${descriptions[descType]?.tag}"
                                @input=${(ev: Event) =>
                                  this.onFieldInput(ev.target)}
                              >
                                ></mwc-textfield
                              >`
                          )
                        : nothing
                    }
                    </div>
                  </div>
                `;
              })}
            `
        )}
      </section>
      <section>
        <h1>External References</h1>
        ${getExtRefElementsByIED(this.selectedIed).map(
          extRef =>
            html`<div class="grouper-extref">
              <p class="col-extref">
                ${extRefPath(extRef)}: ${extRef.getAttribute('intAddr')}
              </p>
              <mwc-textfield
                class="col-extref rounded"
                label="description"
                outlined
                value="${extRef.getAttribute('desc') ?? ''}"
                data-id="${identity(extRef)}"
                data-tag="${extRef.tagName}"
                @input=${(ev: Event) => this.onFieldInput(ev.target)}
              >
                ></mwc-textfield
              >
            </div>`
        )}
      </section>`;
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
    }

    #iedSelector {
      display: inline-flex;
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
    }

    .grouper-extref {
      display: flex;
      width: 50%%;
      align-items: center;
    }

    .col {
      flex: 1 1 25%;
      padding: 10px;
    }

    .col-extref {
      max-width: 400px;
      flex: 1 1 0px;
      padding: 10px;
    }

    h3 {
      font-weight: 500;
    }
  `;
}
