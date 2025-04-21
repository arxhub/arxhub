class CounterComponent extends HTMLElement {
  private count = 0
  private countElement: HTMLElement
  private incrementButton: HTMLButtonElement
  private decrementButton: HTMLButtonElement

  constructor() {
    super()
    const shadowRoot = this.attachShadow({ mode: 'open' })

    shadowRoot.innerHTML = `
      <style>
        :host {
        display: block;
        font-family: sans-serif;
        text-align: center;
        }
        button {
        padding: 10px;
        margin: 5px;
        cursor: pointer;
        }
      </style>
      <div>
        <span id="count">${this.count}</span>
        <button id="increment">+</button>
        <button id="decrement">-</button>
      </div>
		`

    this.countElement = shadowRoot.getElementById('count') as HTMLElement
    this.incrementButton = shadowRoot.getElementById('increment') as HTMLButtonElement
    this.decrementButton = shadowRoot.getElementById('decrement') as HTMLButtonElement

    this.incrementButton.addEventListener('click', () => this.increment())
    this.decrementButton.addEventListener('click', () => this.decrement())
  }

  increment() {
    this.count++
    this.updateCount()
  }

  decrement() {
    this.count--
    this.updateCount()
  }

  updateCount() {
    this.countElement.textContent = this.count.toString()
  }
}

customElements.define('arx-counter', CounterComponent)
