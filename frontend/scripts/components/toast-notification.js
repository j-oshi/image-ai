  class ToastNotification extends HTMLElement {
    static get observedAttributes() {
      return ["message", "background", "color"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.toastContainer = null;
      this.disapperance_timer= this.hasAttribute("disapperance-timer") ? true : false;
      this.timeout = this.hasAttribute("timeout") ? this.getAttribute("timeout") : 3000;
    }

    connectedCallback() {
      this.render();
      this.cacheDom();
      this.closeToast();
    }

    cacheDom() {
      this.toastContainer = this.shadowRoot?.querySelector("#toast");
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (name == "message" && oldVal !== newVal) {
        if (newVal !== "") {
          this.showToast(newVal);
        }
      }
      if (name == "background" && oldVal !== newVal) {
        this.changeBackground(newVal);
      }
      if (name == "color" && oldVal !== newVal) {
        this.changeColor(newVal);
      }
    }

    render() {
      const template = document.createElement("template");
      template.innerHTML = `
              <style>
              #toast {
                max-width: 400px;
                width: fit-content;
                height: fit-content;
                margin: auto;
                position: fixed;
                left: 0;
                bottom: 50px;
                right: 10px;
                background-color: #151515;
                color: white;
                text-align: center;
                padding: 10px;
                z-index: 9999;
                transition: margin-right 1s;
                /* transition: visibility 0.5s, opacity 0.5s linear; */
                border-radius: 8px;
                border: 2px solid rgba(0, 0, 0, 0.2);
                background-clip: padding-box;
                margin-right: -100%;
            }

            #toast-msg {
                font-size: 13px;
                margin: 10px;
                text-align: left;
                line-height: 1.4;
                padding: 0 15px 0 0;
            }
    
            .close-toast {
                color: white;
                float: right;
                font-size: 16px;
                font-weight: bold;
                position: absolute;
                right: 10px;
                top: 10px;
                line-height: 0.4;
            }
        
            .close-toast:hover,
            .close-toast:focus {
                color: var(--theme-color-tertiary);
                text-decoration: none;
                cursor: pointer;
            }
              </style>
              <div id="toast">
                  <span class="close-toast">&times;</span>
                  <p id="toast-msg"></p>
              </div>
            `;
      this.shadowRoot?.appendChild(template.content);
    }

    showToast(message) {
      this.toastContainer.querySelector("#toast-msg").innerHTML = message;
      this.toastContainer.style.marginRight = "0";
      console.log(this.timeout);
      if (this.disapperance_timer) {
        setTimeout(() => {
          this.toastContainer.style.marginRight = "-100%";
        }, Number(this.timeout)); 
      }
    }

    changeBackground(color) {
      this.toastContainer.style.backgroundColor = color;
    }

    changeColor(color) {
      this.toastContainer.querySelector("#toast-msg").style.color = color;
    }

    closeToast() {
      this.toastContainer
        .querySelector(".close-toast")
        .addEventListener("click", () => {
          this.setAttribute("message", "");
          this.toastContainer.style.marginRight = "-100%";
        });
    }
  }
  customElements.define("toast-notification", ToastNotification);