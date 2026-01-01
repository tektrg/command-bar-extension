// Date modal module for adding dates to items with custom calendar

const dateModal = {
  // Show date modal for adding dates to items
  show: (itemData) => {
    const modal = document.getElementById('prd-stv-date-modal');
    const titleEl = document.getElementById('prd-stv-date-item-title');
    const saveBtn = document.getElementById('prd-stv-date-save');
    const cancelBtn = document.getElementById('prd-stv-date-cancel');
    const closeBtn = document.getElementById('prd-stv-date-modal-close');
    const calendarDays = document.getElementById('prd-stv-calendar-days');
    const monthYearEl = document.getElementById('prd-stv-calendar-month-year');
    const prevBtn = document.getElementById('prd-stv-calendar-prev');
    const nextBtn = document.getElementById('prd-stv-calendar-next');

    if (!modal || !titleEl || !saveBtn || !cancelBtn || !closeBtn || !calendarDays || !monthYearEl || !prevBtn || !nextBtn) {
      console.error('Date modal elements not found');
      return;
    }

    // Set item title (escaped for XSS safety)
    titleEl.textContent = itemData.title || 'Untitled';

    // Calendar state
    let currentDate = new Date();
    let selectedDate = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const renderCalendar = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      // Set month/year header
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      monthYearEl.textContent = `${monthNames[month]} ${year}`;

      // Get first day of month and number of days
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysInPrevMonth = new Date(year, month, 0).getDate();

      // Clear previous days
      calendarDays.innerHTML = '';

      // Add previous month's trailing days
      for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayEl = document.createElement('div');
        dayEl.className = 'prd-stv-calendar-day other-month';
        dayEl.textContent = day;
        calendarDays.appendChild(dayEl);
      }

      // Add current month's days
      for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'prd-stv-calendar-day';
        dayEl.textContent = day;

        const dateObj = new Date(year, month, day);
        dateObj.setHours(0, 0, 0, 0);

        // Check if it's today
        if (dateObj.getTime() === today.getTime()) {
          dayEl.classList.add('today');
        }

        // Check if it's in the past (disable)
        if (dateObj < today) {
          dayEl.classList.add('past');
          dayEl.setAttribute('disabled', 'true');
        } else {
          // Check if selected
          if (selectedDate && dateObj.getTime() === selectedDate.getTime()) {
            dayEl.classList.add('selected');
          }

          // Add click handler - auto-save on selection
          dayEl.addEventListener('click', async () => {
            // Remove previous selection
            calendarDays.querySelectorAll('.prd-stv-calendar-day').forEach(d => d.classList.remove('selected'));
            dayEl.classList.add('selected');
            selectedDate = dateObj;

            // Auto-save immediately
            await handleSave();
          });
        }

        calendarDays.appendChild(dayEl);
      }

      // Add next month's leading days to fill grid
      const totalCells = calendarDays.children.length;
      const cellsToFill = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      for (let day = 1; day <= cellsToFill; day++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'prd-stv-calendar-day other-month';
        dayEl.textContent = day;
        calendarDays.appendChild(dayEl);
      }
    };

    const handlePrevMonth = () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      renderCalendar();
    };

    const handleNextMonth = () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      renderCalendar();
    };

    const handleSave = async () => {
      if (!selectedDate) {
        window.utils.showToast('Please select a date');
        return;
      }

      // Use local date to avoid timezone issues
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      try {
        const success = await window.datedLinksModule.addDate(itemData, dateString);
        if (success) {
          window.utils.showToast('Date added');
          modal.style.display = 'none';

          if (window.state && window.elements) {
            await window.renderer.render(window.state, window.elements);
          }
        } else {
          window.utils.showToast('Failed to add date');
        }
      } catch (error) {
        console.error('Failed to add date:', error);
        window.utils.showToast('Failed to add date');
      }
      cleanup();
    };

    const handleClose = () => {
      modal.style.display = 'none';
      cleanup();
    };

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    const handleModalOverlayClick = (e) => {
      if (e.target === modal) {
        handleClose();
      }
    };

    const cleanup = () => {
      saveBtn.removeEventListener('click', handleSave);
      cancelBtn.removeEventListener('click', handleClose);
      closeBtn.removeEventListener('click', handleClose);
      prevBtn.removeEventListener('click', handlePrevMonth);
      nextBtn.removeEventListener('click', handleNextMonth);
      document.removeEventListener('keydown', handleKeydown);
      modal.removeEventListener('click', handleModalOverlayClick);
    };

    // Attach event listeners
    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', handleClose);
    closeBtn.addEventListener('click', handleClose);
    prevBtn.addEventListener('click', handlePrevMonth);
    nextBtn.addEventListener('click', handleNextMonth);
    document.addEventListener('keydown', handleKeydown);
    modal.addEventListener('click', handleModalOverlayClick);

    // Reset and show modal
    selectedDate = null;
    currentDate = new Date();
    saveBtn.disabled = true;

    // Hide cancel and save buttons since we auto-save on selection
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';

    renderCalendar();
    modal.style.display = 'flex';
  }
};

// Export for use in other modules
window.dateModal = dateModal;
