/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- DATA TYPES ---
interface Client {
  id: string;
  name: string;
  phone: string;
}

interface Transaction {
  id: string;
  clientId: string;
  date: string;
  amount: number; // positive for sale/loan, negative for payment
  description: string;
}

interface Sale { // General sale not tied to a client
  id: string;
  date: string;
  amount: number;
  description: string;
}

interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string;
  creditorId?: string; // Optional link to a creditor
}

interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    quantity: number;
}

interface Creditor {
    id: string;
    name: string;
    phone: string;
}

interface CreditorTransaction {
    id: string;
    creditorId: string;
    date: string;
    amount: number; // positive for purchase, negative for payment
    description: string;
}


type Entity = Client | Transaction | Sale | Expense | Product | Creditor | CreditorTransaction;
type EntityType = 'clients' | 'transactions' | 'sales' | 'expenses' | 'products' | 'creditors' | 'creditorTransactions';

// --- DATA STORE (using localStorage) ---
class Store {
  private get<T extends Entity>(type: EntityType): T[] {
    const data = localStorage.getItem(type);
    return data ? (JSON.parse(data) as T[]) : [];
  }

  private set<T extends Entity>(type: EntityType, data: T[]): void {
    localStorage.setItem(type, JSON.stringify(data));
  }
  
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  // Generic save method for all types
  save<T extends Entity & { id: string }>(type: EntityType, item: Omit<T, 'id'> & { id?: string }): T {
    const items = this.get<T>(type);
    if (item.id) { // Update
      const index = items.findIndex(i => i.id === item.id);
      if (index > -1) {
        items[index] = item as T;
      }
    } else { // Create
      item.id = this.generateId();
      items.push(item as T);
    }
    this.set(type, items);
    return item as T;
  }

  delete(type: EntityType, id: string): void {
    let items = this.get(type);
    items = items.filter(item => item.id !== id);
    this.set(type, items);

    if (type === 'clients') {
      const transactions = this.get<Transaction>('transactions').filter(t => t.clientId !== id);
      this.set('transactions', transactions);
    }
    if (type === 'creditors') {
        const transactions = this.get<CreditorTransaction>('creditorTransactions').filter(t => t.creditorId !== id);
        this.set('creditorTransactions', transactions);
    }
  }

  getClients = () => this.get<Client>('clients');
  getClient = (id: string) => this.get<Client>('clients').find(c => c.id === id);
  getSales = () => this.get<Sale>('sales');
  getSale = (id: string) => this.get<Sale>('sales').find(s => s.id === id);
  getExpenses = () => this.get<Expense>('expenses');
  getExpense = (id: string) => this.get<Expense>('expenses').find(e => e.id === id);
  getTransactionsForClient = (clientId: string) => 
    this.get<Transaction>('transactions').filter(t => t.clientId === clientId);
  getTransaction = (id: string) => this.get<Transaction>('transactions').find(t => t.id === id);
  
  getProducts = () => this.get<Product>('products');
  getProduct = (id: string) => this.get<Product>('products').find(p => p.id === id);

  getCreditors = () => this.get<Creditor>('creditors');
  getCreditor = (id: string) => this.get<Creditor>('creditors').find(c => c.id === id);
  getTransactionsForCreditor = (creditorId: string) => 
    this.get<CreditorTransaction>('creditorTransactions').filter(t => t.creditorId === creditorId);
  getCreditorTransaction = (id: string) => this.get<CreditorTransaction>('creditorTransactions').find(t => t.id === id);

  getClientBalance = (clientId: string): number => {
    const transactions = this.getTransactionsForClient(clientId);
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }
  
  getCreditorBalance = (creditorId: string): number => {
      const transactions = this.getTransactionsForCreditor(creditorId);
      return transactions.reduce((sum, t) => sum + t.amount, 0);
  }

  getTotalClientDebt = (): number => {
    const clients = this.getClients();
    return clients.reduce((totalDebt, client) => {
        const balance = this.getClientBalance(client.id);
        return balance > 0 ? totalDebt + balance : totalDebt;
    }, 0);
  }
}

// --- MAIN APP ---
class App {
  private store: Store;
  private currentPage: 'clients' | 'sales' | 'expenses' | 'inventory' | 'creditors' | 'help' = 'clients';
  private currentClientId: string | null = null;
  private currentCreditorId: string | null = null;
  private currentExpenseMonth: string = 'all'; // 'YYYY-MM' format or 'all'
  private currentSaleMonth: string = 'all'; // 'YYYY-MM' format or 'all'
  private currentClientFilter: 'all' | 'debt' | 'credit' = 'all';
  private currentCreditorFilter: 'all' | 'debt' | 'credit' = 'all';
  private appContent: HTMLElement;
  private headerTitle: HTMLElement;
  private modalContainer: HTMLElement;

  constructor() {
    this.store = new Store();
    this.appContent = document.getElementById('app-content')!;
    this.headerTitle = document.getElementById('header-title')!;
    this.modalContainer = document.getElementById('modal-container')!;
    
    this.setupEventListeners();
    this.render();
    this.handleUrlActions(); // Handle actions from shortcuts
  }

  private handleUrlActions(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');

    if (!action) return;

    // Use a short delay to ensure the UI is ready before opening a modal
    setTimeout(() => {
        switch (action) {
            case 'new_client':
                this.renderClientForm();
                break;
            case 'new_sale':
                this.renderSaleForm();
                break;
            case 'new_expense':
                this.renderExpenseForm();
                break;
            case 'new_product':
                this.renderProductForm();
                break;
        }
        // Clean the URL so the action doesn't re-trigger on reload
        window.history.replaceState({}, document.title, window.location.pathname);
    }, 100);
  }

  private setupEventListeners(): void {
    document.getElementById('bottom-nav')?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.nav-btn');
      if (target) {
        const page = (target as HTMLElement).dataset.page as any;
        if (this.currentPage !== page) {
            this.currentClientId = null;
            this.currentCreditorId = null;
            this.currentPage = page;
            this.render();
        }
      }
    });

    this.appContent.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const clientCard = target.closest('.client-card');
      const creditorCard = target.closest('.creditor-card');
      const fab = target.closest('.fab');
      const editBtn = target.closest('[data-action="edit"]');
      const deleteBtn = target.closest('[data-action="delete"]');
      
      if (clientCard) {
        this.currentClientId = clientCard.getAttribute('data-client-id');
        this.render();
      }
      if (creditorCard) {
        this.currentCreditorId = creditorCard.getAttribute('data-creditor-id');
        this.render();
      }
      if (fab) {
        this.handleFabClick();
      }
      if(editBtn) {
        this.handleEditClick(editBtn as HTMLElement);
      }
      if (deleteBtn) {
        this.handleDeleteClick(deleteBtn as HTMLElement);
      }
    });
  }

  private handleFabClick(): void {
    if (this.currentClientId) {
      this.renderTransactionForm();
    } else if (this.currentCreditorId) {
        this.renderCreditorTransactionForm();
    } else {
      switch (this.currentPage) {
        case 'clients': this.renderClientForm(); break;
        case 'sales': this.renderSaleForm(); break;
        case 'expenses': this.renderExpenseForm(); break;
        case 'inventory': this.renderProductForm(); break;
        case 'creditors': this.renderCreditorForm(); break;
      }
    }
  }

  private handleEditClick(element: HTMLElement): void {
    const type = element.dataset.type as EntityType | 'transaction' | 'creditorTransaction';
    const id = element.dataset.id!;

    switch (type) {
      case 'clients': this.renderClientForm(this.store.getClient(id)); break;
      case 'transaction': this.renderTransactionForm(this.store.getTransaction(id)); break;
      case 'sales': this.renderSaleForm(this.store.getSale(id)); break;
      case 'expenses': this.renderExpenseForm(this.store.getExpense(id)); break;
      case 'products': this.renderProductForm(this.store.getProduct(id)); break;
      case 'creditors': this.renderCreditorForm(this.store.getCreditor(id)); break;
      case 'creditorTransaction': this.renderCreditorTransactionForm(this.store.getCreditorTransaction(id)); break;
    }
  }

  private handleDeleteClick(element: HTMLElement): void {
    const type = element.dataset.type as EntityType | 'transaction' | 'creditorTransaction';
    const id = element.dataset.id!;
    
    const messages: { [key: string]: string } = {
        default: '¿Estás seguro que quieres eliminar este elemento?',
        clients: '¿Estás seguro? Se borrarán todas las transacciones del cliente.',
        creditors: '¿Estás seguro? Se borrarán todas las transacciones del acreedor.',
        products: '¿Estás seguro que quieres eliminar este producto del inventario?',
    };
    
    const message = messages[type] || messages.default;
    
    if (confirm(message)) {
      let storeType: EntityType;
      if (type === 'transaction') storeType = 'transactions';
      else if (type === 'creditorTransaction') storeType = 'creditorTransactions';
      else storeType = type;
      
      this.store.delete(storeType, id);
      this.render();
    }
  }

  private updateActiveNav(): void {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-page') === this.currentPage);
    });
  }

  private render(): void {
    this.updateActiveNav();
    if (this.currentClientId) {
      this.renderClientDetailPage(this.currentClientId);
    } else if (this.currentCreditorId) {
        this.renderCreditorDetailPage(this.currentCreditorId);
    } else {
      switch (this.currentPage) {
        case 'clients': this.renderClientsPage(); break;
        case 'sales': this.renderSalesPage(); break;
        case 'expenses': this.renderExpensesPage(); break;
        case 'inventory': this.renderInventoryPage(); break;
        case 'creditors': this.renderCreditorsPage(); break;
        case 'help': this.renderHelpPage(); break;
      }
    }
  }

  // --- PAGE RENDERERS ---

  private renderClientsPage(): void {
    this.headerTitle.textContent = 'Clientes';
    const clients = this.store.getClients();
    const totalDebt = this.store.getTotalClientDebt();
    const formattedTotalDebt = totalDebt.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });

    const filteredClients = clients.filter(client => {
        if (this.currentClientFilter === 'all') return true;
        const balance = this.store.getClientBalance(client.id);
        if (this.currentClientFilter === 'debt') return balance > 0;
        if (this.currentClientFilter === 'credit') return balance < 0;
        return false;
    });

    let content = `
      <select id="client-filter" class="month-select">
        <option value="all" ${this.currentClientFilter === 'all' ? 'selected' : ''}>Mostrar Todos</option>
        <option value="debt" ${this.currentClientFilter === 'debt' ? 'selected' : ''}>Con Deuda</option>
        <option value="credit" ${this.currentClientFilter === 'credit' ? 'selected' : ''}>Con Saldo a Favor</option>
      </select>
      <div class="summary-card">
        <span>Deuda Total de Clientes</span>
        <span class="total-debt">${formattedTotalDebt}</span>
      </div>
      <div class="item-list">`;
    
    if (filteredClients.length === 0) {
      content += `
        <div class="empty-state">
          <i class="fas fa-users-slash"></i>
          <p>${clients.length > 0 ? 'No hay clientes que coincidan con el filtro.' : 'No hay clientes todavía.'}</p>
          ${clients.length > 0 ? '' : "<p>Toca el botón '+' para agregar uno.</p>"}
        </div>`;
    } else {
        filteredClients.forEach(client => {
            const balance = this.store.getClientBalance(client.id);
            const balanceClass = balance > 0 ? 'negative' : balance < 0 ? 'positive' : '';
            const formattedBalance = balance.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
            content += `
            <div class="card client-card" data-client-id="${client.id}">
                <div class="card-header">
                <span class="card-title">${client.name}</span>
                <span class="card-balance ${balanceClass}">${formattedBalance}</span>
                </div>
                <div class="card-body">${client.phone}</div>
            </div>`;
        });
    }
    content += '</div>';
    
    this.appContent.innerHTML = content + '<button class="fab" aria-label="Agregar Cliente"><i class="fas fa-plus"></i></button>';
    
    document.getElementById('client-filter')?.addEventListener('change', (e) => {
        this.currentClientFilter = (e.target as HTMLSelectElement).value as any;
        this.render();
    });
  }

  private renderClientDetailPage(clientId: string): void {
    const client = this.store.getClient(clientId);
    if (!client) { this.currentClientId = null; this.render(); return; }

    this.headerTitle.innerHTML = `<button id="back-btn" class="back-button">&larr;</button> <span>${client.name}</span>`;
    document.getElementById('back-btn')?.addEventListener('click', () => {
        this.currentClientId = null;
        this.render();
    });

    const transactions = this.store.getTransactionsForClient(clientId);
    const balance = this.store.getClientBalance(clientId);
    const balanceClass = balance > 0 ? 'negative' : balance < 0 ? 'positive' : '';
    const formattedBalance = balance.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });

    let content = `
      <div style="margin-bottom: 20px;">
        <h3>Saldo Total: <span class="${balanceClass}">${formattedBalance}</span></h3>
        <p>Teléfono: ${client.phone}</p>
        <div class="client-actions">
            <button class="btn btn-secondary" data-action="edit" data-type="clients" data-id="${client.id}">Editar Cliente</button>
            <button class="btn btn-danger" data-action="delete" data-type="clients" data-id="${client.id}">Eliminar Cliente</button>
        </div>
      </div>
      <h4>Transacciones</h4>
      <div class="item-list">`;

    if (transactions.length === 0) {
        content += `<div class="empty-state"><p>No hay transacciones.</p></div>`;
    } else {
        transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).forEach(t => {
            const amountClass = t.amount >= 0 ? 'positive' : 'negative';
            const formattedAmount = t.amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
            content += `
            <div class="card">
                <div class="card-header">
                    <span class="card-title">${new Date(t.date).toLocaleDateString('es-CO')}</span>
                    <div>
                        <span class="card-balance ${amountClass}">${formattedAmount}</span>
                        <button class="icon-btn" data-action="edit" data-type="transaction" data-id="${t.id}" aria-label="Editar"><i class="fas fa-edit"></i></button>
                        <button class="icon-btn icon-btn-delete" data-action="delete" data-type="transaction" data-id="${t.id}" aria-label="Eliminar"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div class="card-body">${t.description}</div>
            </div>`;
        });
    }

    content += '</div>'
    this.appContent.innerHTML = content + '<button class="fab" aria-label="Agregar Transacción"><i class="fas fa-plus"></i></button>';
  }

  private renderSalesPage(): void {
    this.headerTitle.textContent = 'Ventas Generales';
    const sales = this.store.getSales();
    const months = [...new Set(sales.map(s => s.date.substring(0, 7)))].sort().reverse();
    if (this.currentSaleMonth !== 'all' && !months.includes(this.currentSaleMonth)) {
        this.currentSaleMonth = 'all';
    }
    const filteredSales = this.currentSaleMonth === 'all' 
      ? sales 
      : sales.filter(s => s.date.startsWith(this.currentSaleMonth));
    const totalSales = filteredSales.reduce((sum, s) => sum + s.amount, 0);
    const formattedTotalSales = totalSales.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
    let monthOptions = '<option value="all">Todos los Meses</option>';
    months.forEach(month => {
        const date = new Date(month + '-02');
        const monthName = date.toLocaleString('es-CO', { month: 'long', year: 'numeric' });
        monthOptions += `<option value="${month}" ${this.currentSaleMonth === month ? 'selected' : ''}>${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</option>`;
    });

    let content = `
      <select id="month-filter-sales" class="month-select">${monthOptions}</select>
      <div class="summary-card">
          <span>Total Ventas (Selección)</span>
          <span class="card-balance positive">${formattedTotalSales}</span>
      </div>
      <div class="item-list">`;

    if (filteredSales.length === 0) {
      content += `<div class="empty-state"><p>No hay ventas registradas${this.currentSaleMonth !== 'all' ? ' para este mes' : ''}.</p></div>`;
    } else {
        filteredSales.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).forEach(sale => {
            const formattedAmount = sale.amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
            content += `
            <div class="card">
                <div class="card-header">
                    <span class="card-title">${new Date(sale.date).toLocaleDateString('es-CO')}</span>
                    <div>
                      <span class="card-balance positive">${formattedAmount}</span>
                      <button class="icon-btn" data-action="edit" data-type="sales" data-id="${sale.id}" aria-label="Editar"><i class="fas fa-edit"></i></button>
                      <button class="icon-btn icon-btn-delete" data-action="delete" data-type="sales" data-id="${sale.id}" aria-label="Eliminar"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div class="card-body">${sale.description}</div>
            </div>`;
        });
    }
    content += '</div>';

    this.appContent.innerHTML = content + '<button class="fab" aria-label="Agregar Venta"><i class="fas fa-plus"></i></button>';

    document.getElementById('month-filter-sales')?.addEventListener('change', (e) => {
        this.currentSaleMonth = (e.target as HTMLSelectElement).value;
        this.render();
    });
  }

  private renderExpensesPage(): void {
    this.headerTitle.textContent = 'Gastos Personales';
    const expenses = this.store.getExpenses();
    const months = [...new Set(expenses.map(e => e.date.substring(0, 7)))].sort().reverse();
    if (this.currentExpenseMonth !== 'all' && !months.includes(this.currentExpenseMonth)) {
        this.currentExpenseMonth = 'all';
    }
    const filteredExpenses = this.currentExpenseMonth === 'all' 
      ? expenses 
      : expenses.filter(e => e.date.startsWith(this.currentExpenseMonth));
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const formattedTotalExpenses = totalExpenses.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
    let monthOptions = '<option value="all">Todos los Meses</option>';
    months.forEach(month => {
        const date = new Date(month + '-02');
        const monthName = date.toLocaleString('es-CO', { month: 'long', year: 'numeric' });
        monthOptions += `<option value="${month}" ${this.currentExpenseMonth === month ? 'selected' : ''}>${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</option>`;
    });

    let content = `
      <select id="month-filter" class="month-select">${monthOptions}</select>
      <div class="summary-card">
          <span>Total Gastos (Selección)</span>
          <span class="total-expense">-${formattedTotalExpenses}</span>
      </div>
      <div class="item-list">`;
    if (filteredExpenses.length === 0) {
      content += `<div class="empty-state"><p>No hay gastos registrados${this.currentExpenseMonth !== 'all' ? ' para este mes' : ''}.</p></div>`;
    } else {
        filteredExpenses.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).forEach(expense => {
            const formattedAmount = expense.amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
            content += `
            <div class="card" style="border-left-color: var(--debt-color);">
                <div class="card-header">
                    <span class="card-title">${expense.category}</span>
                    <div>
                      <span class="card-balance negative">-${formattedAmount}</span>
                      <button class="icon-btn" data-action="edit" data-type="expenses" data-id="${expense.id}" aria-label="Editar"><i class="fas fa-edit"></i></button>
                      <button class="icon-btn icon-btn-delete" data-action="delete" data-type="expenses" data-id="${expense.id}" aria-label="Eliminar"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div class="card-body">${expense.description} - ${new Date(expense.date).toLocaleDateString('es-CO')}</div>
            </div>`;
        });
    }
    content += '</div>';
    this.appContent.innerHTML = content + '<button class="fab" aria-label="Agregar Gasto"><i class="fas fa-plus"></i></button>';
    
    document.getElementById('month-filter')?.addEventListener('change', (e) => {
        this.currentExpenseMonth = (e.target as HTMLSelectElement).value;
        this.render();
    });
  }

  private renderInventoryPage(): void {
    this.headerTitle.textContent = 'Inventario';
    const products = this.store.getProducts();
    let content = '<div class="item-list">';
    if (products.length === 0) {
        content += `<div class="empty-state"><i class="fas fa-box-open"></i><p>No hay productos en el inventario.</p></div>`;
    } else {
        products.forEach(p => {
            const formattedPrice = p.price.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
            content += `
            <div class="card">
                <div class="card-header">
                    <span class="card-title">${p.name} (x${p.quantity})</span>
                    <div>
                      <span class="card-balance positive">${formattedPrice}</span>
                      <button class="icon-btn" data-action="edit" data-type="products" data-id="${p.id}" aria-label="Editar"><i class="fas fa-edit"></i></button>
                      <button class="icon-btn icon-btn-delete" data-action="delete" data-type="products" data-id="${p.id}" aria-label="Eliminar"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div class="card-body">${p.description}</div>
            </div>`;
        });
    }
    content += '</div>';
    this.appContent.innerHTML = content + '<button class="fab" aria-label="Agregar Producto"><i class="fas fa-plus"></i></button>';
  }

  private renderCreditorsPage(): void {
    this.headerTitle.textContent = 'Acreedores';
    const creditors = this.store.getCreditors();

    const filteredCreditors = creditors.filter(creditor => {
        if (this.currentCreditorFilter === 'all') return true;
        const balance = this.store.getCreditorBalance(creditor.id);
        if (this.currentCreditorFilter === 'debt') return balance > 0; // I owe them
        if (this.currentCreditorFilter === 'credit') return balance < 0; // They owe me
        return false;
    });

    let content = `
      <select id="creditor-filter" class="month-select">
        <option value="all" ${this.currentCreditorFilter === 'all' ? 'selected' : ''}>Mostrar Todos</option>
        <option value="debt" ${this.currentCreditorFilter === 'debt' ? 'selected' : ''}>Con Deuda</option>
        <option value="credit" ${this.currentCreditorFilter === 'credit' ? 'selected' : ''}>Con Saldo a Favor</option>
      </select>
      <div class="item-list">`;
     if (filteredCreditors.length === 0) {
      content += `<div class="empty-state"><i class="fas fa-receipt"></i><p>${creditors.length > 0 ? 'No hay acreedores que coincidan con el filtro.' : 'No hay acreedores todavía.'}</p></div>`;
    } else {
        filteredCreditors.forEach(c => {
            const balance = this.store.getCreditorBalance(c.id);
            const balanceClass = balance > 0 ? 'negative' : 'positive';
            const formattedBalance = balance.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
            content += `
            <div class="card creditor-card" data-creditor-id="${c.id}">
                <div class="card-header">
                <span class="card-title">${c.name}</span>
                <span class="card-balance ${balanceClass}">${formattedBalance}</span>
                </div>
                <div class="card-body">${c.phone}</div>
            </div>`;
        });
    }
    content += '</div>';
    this.appContent.innerHTML = content + '<button class="fab" aria-label="Agregar Acreedor"><i class="fas fa-plus"></i></button>';

    document.getElementById('creditor-filter')?.addEventListener('change', (e) => {
        this.currentCreditorFilter = (e.target as HTMLSelectElement).value as any;
        this.render();
    });
  }

   private renderCreditorDetailPage(creditorId: string): void {
    const creditor = this.store.getCreditor(creditorId);
    if (!creditor) { this.currentCreditorId = null; this.render(); return; }

    this.headerTitle.innerHTML = `<button id="back-btn" class="back-button">&larr;</button> <span>${creditor.name}</span>`;
    document.getElementById('back-btn')?.addEventListener('click', () => {
        this.currentCreditorId = null;
        this.render();
    });

    const transactions = this.store.getTransactionsForCreditor(creditorId);
    const balance = this.store.getCreditorBalance(creditorId);
    const balanceClass = balance > 0 ? 'negative' : 'positive';
    const formattedBalance = balance.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });

    let content = `
      <div style="margin-bottom: 20px;">
        <h3>Saldo (Deuda): <span class="${balanceClass}">${formattedBalance}</span></h3>
        <p>Teléfono: ${creditor.phone}</p>
        <div class="client-actions">
            <button class="btn btn-secondary" data-action="edit" data-type="creditors" data-id="${creditor.id}">Editar Acreedor</button>
            <button class="btn btn-danger" data-action="delete" data-type="creditors" data-id="${creditor.id}">Eliminar Acreedor</button>
        </div>
      </div>
      <h4>Historial de Compras/Pagos</h4>
      <div class="item-list">`;

    if (transactions.length === 0) {
        content += `<div class="empty-state"><p>No hay transacciones.</p></div>`;
    } else {
        transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).forEach(t => {
            const amountClass = t.amount >= 0 ? 'positive' : 'negative';
            const formattedAmount = t.amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
            content += `
            <div class="card">
                <div class="card-header">
                    <span class="card-title">${new Date(t.date).toLocaleDateString('es-CO')}</span>
                    <div>
                        <span class="card-balance ${amountClass}">${formattedAmount}</span>
                        <button class="icon-btn" data-action="edit" data-type="creditorTransaction" data-id="${t.id}" aria-label="Editar"><i class="fas fa-edit"></i></button>
                        <button class="icon-btn icon-btn-delete" data-action="delete" data-type="creditorTransaction" data-id="${t.id}" aria-label="Eliminar"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div class="card-body">${t.description}</div>
            </div>`;
        });
    }

    content += '</div>'
    this.appContent.innerHTML = content + '<button class="fab" aria-label="Agregar Compra/Pago"><i class="fas fa-plus"></i></button>';
  }

  private renderHelpPage(): void {
    this.headerTitle.textContent = 'Ayuda e Información';
    const content = `
      <div class="item-list">
        <div class="card">
          <div class="card-header"><span class="card-title">Cómo Instalar esta Aplicación</span></div>
          <div class="card-body" style="line-height: 1.6;">
            <p>Puedes instalar esta aplicación en tu dispositivo para un acceso más rápido y para usarla sin conexión a internet.</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header" style="margin-bottom: 16px;"><span class="card-title"><i class="fab fa-android" style="color: #3DDC84; margin-right: 8px;"></i> Android (Chrome)</span></div>
          <div class="card-body">
            <ol style="padding-left: 20px;">
              <li>Toca el menú de los tres puntos (<i class="fas fa-ellipsis-v" style="width: 1em; text-align: center;"></i>) en la esquina superior derecha.</li>
              <li>Selecciona <strong>"Instalar aplicación"</strong> o "Agregar a la pantalla principal".</li>
              <li>Sigue las instrucciones en pantalla.</li>
            </ol>
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="margin-bottom: 16px;"><span class="card-title"><i class="fab fa-apple" style="color: #A2AAAD; margin-right: 8px;"></i> iPhone / iPad (Safari)</span></div>
          <div class="card-body">
            <ol style="padding-left: 20px;">
              <li>Toca el ícono de Compartir (<i class="fas fa-arrow-up-from-bracket" style="width: 1em; text-align: center;"></i>) en la barra de navegación.</li>
              <li>Desliza hacia arriba y selecciona <strong>"Agregar a la pantalla de inicio"</strong>.</li>
              <li>Confirma para añadir el ícono a tu pantalla.</li>
            </ol>
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="margin-bottom: 16px;"><span class="card-title"><i class="fas fa-desktop" style="margin-right: 8px;"></i> Computadora (Chrome/Edge)</span></div>
          <div class="card-body">
            <ol style="padding-left: 20px;">
              <li>Busca el ícono de instalación (<i class="fas fa-download" style="width: 1em; text-align: center;"></i>) en la parte derecha de la barra de direcciones.</li>
              <li>Haz clic en él y confirma la instalación.</li>
              <li>La aplicación se abrirá en su propia ventana.</li>
            </ol>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Acerca de la App</span></div>
          <div class="card-body" style="color: var(--on-background-color);">
            <p><strong>Gestión de Ventas y Finanzas v1.0.1</strong></p>
            <p>Esta es una aplicación local. Todos tus datos se guardan de forma segura únicamente en tu dispositivo y no se envían a ningún servidor.</p>
          </div>
        </div>
      </div>
    `;
    // No FAB on this page
    this.appContent.innerHTML = content;
  }
  
  // --- FORM RENDERERS ---

  private renderClientForm(client?: Client): void {
    const isEditing = !!client;
    const modalHTML = `
      <div class="modal-content">
        <div class="modal-header"><h2 class="modal-title">${isEditing ? 'Editar' : 'Nuevo'} Cliente</h2><button class="close-btn">&times;</button></div>
        <form id="client-form">
          <input type="hidden" name="id" value="${client?.id || ''}">
          <div class="form-group"><label for="name">Nombre</label><input type="text" id="name" name="name" value="${client?.name || ''}" required></div>
          <div class="form-group"><label for="phone">Teléfono</label><input type="tel" id="phone" name="phone" value="${client?.phone || ''}"></div>
          <div class="form-actions"><button type="button" class="btn btn-secondary close-btn">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      </div>`;
    this.showModal(modalHTML);
    const form = document.getElementById('client-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const newClient: Omit<Client, 'id'> & {id?: string} = {
        id: formData.get('id') as string || undefined,
        name: formData.get('name') as string,
        phone: formData.get('phone') as string,
      };
      this.store.save('clients', newClient);
      this.closeModal(); this.render();
    });
  }
  
  private renderTransactionForm(transaction?: Transaction): void {
    const isEditing = !!transaction;
    const modalHTML = `
      <div class="modal-content">
        <div class="modal-header"><h2 class="modal-title">${isEditing ? 'Editar' : 'Nueva'} Transacción</h2><button class="close-btn">&times;</button></div>
        <form id="transaction-form">
          <input type="hidden" name="id" value="${transaction?.id || ''}">
          <div class="form-group"><label for="amount">Monto (Use '-' para abonos)</label><input type="number" id="amount" name="amount" step="0.01" value="${transaction?.amount || ''}" required></div>
          <div class="form-group"><label for="description">Descripción</label><input type="text" id="description" name="description" value="${transaction?.description || ''}" required></div>
          <div class="form-group"><label for="date">Fecha</label><input type="date" id="date" name="date" value="${transaction?.date || new Date().toISOString().split('T')[0]}" required></div>
          <div class="form-actions"><button type="button" class="btn btn-secondary close-btn">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      </div>`;
    this.showModal(modalHTML);
    const form = document.getElementById('transaction-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const newTransaction: Omit<Transaction, 'id'> & {id?: string} = {
            id: formData.get('id') as string || undefined,
            clientId: transaction?.clientId || this.currentClientId!,
            amount: parseFloat(formData.get('amount') as string),
            description: formData.get('description') as string,
            date: formData.get('date') as string,
        };
        this.store.save('transactions', newTransaction);
        this.closeModal(); this.render();
    });
  }

  private renderSaleForm(sale?: Sale): void {
    const isEditing = !!sale;
    const clients = this.store.getClients();
    let clientOptions = '<option value="">Venta General (Sin Cliente)</option>';
    clients.forEach(c => clientOptions += `<option value="${c.id}">${c.name}</option>`);

    const products = this.store.getProducts();
    let productOptions = '<option value="">Venta Manual</option>';
    products.filter(p => p.quantity > 0).forEach(p => productOptions += `<option value="${p.id}" data-price="${p.price}" data-desc="${p.name}">${p.name} (Stock: ${p.quantity})</option>`);

    const modalHTML = `
      <div class="modal-content">
        <div class="modal-header"><h2 class="modal-title">${isEditing ? 'Editar' : 'Nueva'} Venta</h2><button class="close-btn">&times;</button></div>
        <form id="sale-form">
          <input type="hidden" name="id" value="${sale?.id || ''}">
          ${!isEditing ? `
          <div class="form-group"><label for="clientId">Asociar a Cliente (Opcional)</label><select id="clientId" name="clientId">${clientOptions}</select></div>
          <div class="form-group"><label for="productId">Vender de Inventario (Opcional)</label><select id="productId" name="productId">${productOptions}</select></div>
          <div class="form-group hidden" id="quantity-group"><label for="quantity">Cantidad</label><input type="number" id="quantity" name="quantity" value="1" min="1"></div>
          ` : ''}
          <div class="form-group"><label for="amount">Monto</label><input type="number" id="amount" name="amount" step="0.01" value="${sale?.amount || ''}" required ${!isEditing ? 'readonly' : ''}></div>
          <div class="form-group"><label for="description">Descripción</label><input type="text" id="description" name="description" value="${sale?.description || ''}" required></div>
          <div class="form-group"><label for="date">Fecha</label><input type="date" id="date" name="date" value="${sale?.date || new Date().toISOString().split('T')[0]}" required></div>
          <div class="form-actions"><button type="button" class="btn btn-secondary close-btn">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      </div>`;
    this.showModal(modalHTML);
    const form = document.getElementById('sale-form') as HTMLFormElement;
    const productSelect = form.querySelector('#productId') as HTMLSelectElement;
    const quantityInput = form.querySelector('#quantity') as HTMLInputElement;
    const quantityGroup = form.querySelector('#quantity-group') as HTMLDivElement;
    const amountInput = form.querySelector('#amount') as HTMLInputElement;
    const descriptionInput = form.querySelector('#description') as HTMLInputElement;

    const updateSaleForm = () => {
        const selectedOption = productSelect.options[productSelect.selectedIndex];
        const price = parseFloat(selectedOption.dataset.price || '0');
        const quantity = parseInt(quantityInput.value) || 1;
        if (price > 0) {
            amountInput.value = (price * quantity).toString();
            amountInput.readOnly = true;
            descriptionInput.value = selectedOption.dataset.desc || '';
            quantityGroup.classList.remove('hidden');
            const product = this.store.getProduct(productSelect.value);
            if (product) quantityInput.max = product.quantity.toString();
        } else {
            amountInput.readOnly = false;
            quantityGroup.classList.add('hidden');
        }
    };

    if (!isEditing) {
        productSelect?.addEventListener('change', updateSaleForm);
        quantityInput?.addEventListener('input', updateSaleForm);
    }
    
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const clientId = fd.get('clientId') as string;
      const productId = fd.get('productId') as string;
      const quantity = parseInt(fd.get('quantity') as string);
      
      if (!isEditing && productId) {
          const product = this.store.getProduct(productId);
          if (product && product.quantity >= quantity) {
              product.quantity -= quantity;
              this.store.save('products', product);
          } else {
              alert('No hay suficiente stock para esta venta.');
              return;
          }
      }

      if (!isEditing && clientId) {
        this.store.save<Transaction>('transactions', {
          clientId: clientId, amount: Math.abs(parseFloat(fd.get('amount') as string)),
          description: fd.get('description') as string, date: fd.get('date') as string,
        });
      } else {
        this.store.save<Sale>('sales', {
          id: fd.get('id') as string || undefined, amount: parseFloat(fd.get('amount') as string),
          description: fd.get('description') as string, date: fd.get('date') as string,
        });
      }
      this.closeModal(); this.render();
    });
  }

  private renderExpenseForm(expense?: Expense): void {
    const isEditing = !!expense;
    const creditors = this.store.getCreditors();
    let creditorOptions = '<option value="">Gasto General</option>';
    creditors.forEach(c => creditorOptions += `<option value="${c.id}" ${expense?.creditorId === c.id ? 'selected': ''}>Pago a: ${c.name}</option>`);

    const modalHTML = `
      <div class="modal-content">
        <div class="modal-header"><h2 class="modal-title">${isEditing ? 'Editar' : 'Nuevo'} Gasto</h2><button class="close-btn">&times;</button></div>
        <form id="expense-form">
          <input type="hidden" name="id" value="${expense?.id || ''}">
          <div class="form-group"><label for="creditorId">Asociar a Acreedor (Opcional)</label><select id="creditorId" name="creditorId">${creditorOptions}</select></div>
          <div class="form-group"><label for="amount">Monto</label><input type="number" id="amount" name="amount" step="0.01" value="${expense?.amount || ''}" required></div>
          <div class="form-group"><label for="category">Categoría</label><input type="text" id="category" name="category" value="${expense?.category || ''}" placeholder="Transporte, Comida..." required></div>
          <div class="form-group"><label for="description">Descripción</label><input type="text" id="description" name="description" value="${expense?.description || ''}" required></div>
          <div class="form-group"><label for="date">Fecha</label><input type="date" id="date" name="date" value="${expense?.date || new Date().toISOString().split('T')[0]}" required></div>
          <div class="form-actions"><button type="button" class="btn btn-secondary close-btn">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      </div>`;
    this.showModal(modalHTML);
    const form = document.getElementById('expense-form') as HTMLFormElement;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const creditorId = fd.get('creditorId') as string;
      const amount = parseFloat(fd.get('amount') as string);
      
      this.store.save<Expense>('expenses', {
        id: fd.get('id') as string || undefined, amount: amount,
        category: fd.get('category') as string, description: fd.get('description') as string,
        date: fd.get('date') as string, creditorId: creditorId || undefined,
      });

      if (creditorId && !isEditing) {
          this.store.save<CreditorTransaction>('creditorTransactions', {
              creditorId, amount: -Math.abs(amount), // Payment is negative
              description: `Pago registrado desde gastos: ${fd.get('description') as string}`,
              date: fd.get('date') as string,
          });
      }

      this.closeModal(); this.render();
    });
  }

  private renderProductForm(product?: Product): void {
      const isEditing = !!product;
      const modalHTML = `
      <div class="modal-content">
        <div class="modal-header"><h2 class="modal-title">${isEditing ? 'Editar' : 'Nuevo'} Producto</h2><button class="close-btn">&times;</button></div>
        <form id="product-form">
          <input type="hidden" name="id" value="${product?.id || ''}">
          <div class="form-group"><label for="name">Nombre</label><input type="text" name="name" value="${product?.name || ''}" required></div>
          <div class="form-group"><label for="description">Descripción</label><input type="text" name="description" value="${product?.description || ''}"></div>
          <div class="form-group"><label for="price">Precio de Venta</label><input type="number" name="price" step="0.01" value="${product?.price || ''}" required></div>
          <div class="form-group"><label for="quantity">Cantidad en Stock</label><input type="number" name="quantity" value="${product?.quantity || '0'}" required></div>
          <div class="form-actions"><button type="button" class="btn btn-secondary close-btn">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      </div>`;
      this.showModal(modalHTML);
      const form = document.getElementById('product-form') as HTMLFormElement;
      form.addEventListener('submit', e => {
          e.preventDefault();
          const fd = new FormData(form);
          this.store.save<Product>('products', {
              id: fd.get('id') as string || undefined,
              name: fd.get('name') as string, description: fd.get('description') as string,
              price: parseFloat(fd.get('price') as string), quantity: parseInt(fd.get('quantity') as string),
          });
          this.closeModal(); this.render();
      });
  }
  
  private renderCreditorForm(creditor?: Creditor): void {
    const isEditing = !!creditor;
    const modalHTML = `
      <div class="modal-content">
        <div class="modal-header"><h2 class="modal-title">${isEditing ? 'Editar' : 'Nuevo'} Acreedor</h2><button class="close-btn">&times;</button></div>
        <form id="creditor-form">
          <input type="hidden" name="id" value="${creditor?.id || ''}">
          <div class="form-group"><label for="name">Nombre</label><input type="text" name="name" value="${creditor?.name || ''}" required></div>
          <div class="form-group"><label for="phone">Teléfono</label><input type="tel" name="phone" value="${creditor?.phone || ''}"></div>
          <div class="form-actions"><button type="button" class="btn btn-secondary close-btn">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      </div>`;
    this.showModal(modalHTML);
    const form = document.getElementById('creditor-form') as HTMLFormElement;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      this.store.save<Creditor>('creditors', {
        id: fd.get('id') as string || undefined,
        name: fd.get('name') as string, phone: fd.get('phone') as string,
      });
      this.closeModal(); this.render();
    });
  }
  
  private renderCreditorTransactionForm(transaction?: CreditorTransaction): void {
    const isEditing = !!transaction;
    const products = this.store.getProducts();
    let productOptions = '<option value="">Compra Manual</option>';
    products.forEach(p => productOptions += `<option value="${p.id}">${p.name}</option>`);

    const modalHTML = `
      <div class="modal-content">
        <div class="modal-header"><h2 class="modal-title">${isEditing ? 'Editar' : 'Nueva'} Compra/Pago</h2><button class="close-btn">&times;</button></div>
        <form id="creditor-transaction-form">
          <input type="hidden" name="id" value="${transaction?.id || ''}">
          <div class="form-group"><label for="amount">Monto (Use '-' para pagos)</label><input type="number" id="amount" name="amount" step="0.01" value="${transaction?.amount || ''}" required></div>
          <div class="form-group"><label for="description">Descripción</label><input type="text" id="description" name="description" value="${transaction?.description || ''}" required></div>
          <div class="form-group"><label for="date">Fecha</label><input type="date" id="date" name="date" value="${transaction?.date || new Date().toISOString().split('T')[0]}" required></div>
          ${!isEditing ? `
          <fieldset><legend>Añadir a Inventario</legend>
            <div class="form-group"><label for="productId">Producto</label><select name="productId">${productOptions}</select></div>
            <div class="form-group"><label for="quantity">Cantidad Recibida</label><input type="number" name="quantity" min="0"></div>
          </fieldset>
          ` : ''}
          <div class="form-actions"><button type="button" class="btn btn-secondary close-btn">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      </div>`;
    this.showModal(modalHTML);
    const form = document.getElementById('creditor-transaction-form') as HTMLFormElement;
    form.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(form);
        const productId = fd.get('productId') as string;
        const quantity = parseInt(fd.get('quantity') as string);

        if (productId && quantity > 0 && !isEditing) {
            const product = this.store.getProduct(productId);
            if (product) {
                product.quantity += quantity;
                this.store.save('products', product);
            }
        }

        this.store.save<CreditorTransaction>('creditorTransactions', {
            id: fd.get('id') as string || undefined,
            creditorId: transaction?.creditorId || this.currentCreditorId!,
            amount: parseFloat(fd.get('amount') as string),
            description: fd.get('description') as string, date: fd.get('date') as string,
        });
        this.closeModal(); this.render();
    });
  }

  // --- MODAL UTILS ---
  private showModal(innerHTML: string): void {
    this.modalContainer.innerHTML = innerHTML;
    this.modalContainer.classList.remove('hidden');
    this.modalContainer.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal());
    });
  }

  private closeModal(): void {
    this.modalContainer.classList.add('hidden');
    this.modalContainer.innerHTML = '';
  }
}

// Initialize the app
new App();

// Register the service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}


export {};