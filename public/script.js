document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadResults = document.getElementById('uploadResults');
    const loadingSpinner = document.getElementById('loadingSpinner');

    let currentData = null;
    let charts = {};

    // API Configuration
    const API_BASE_URL = window.location.origin;


    // Tab Navigation
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update active tab pane
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');

            // Render charts for the active tab
            if (currentData) {
                renderChartsForTab(targetTab);
            }
        });
    });

    // File Selection Handler
    const fileInput = document.getElementById('recruitmentData');
    const fileLabel = document.querySelector('label[for="recruitmentData"]');
    const originalLabelContent = fileLabel.innerHTML;

    fileInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            fileLabel.innerHTML = `
                <span class="upload-icon">✅</span>
                <span><strong>${file.name}</strong></span>
                <span class="upload-hint">File selected - Ready to upload and analyze</span>
            `;
            fileLabel.classList.add('file-selected');
        } else {
            fileLabel.innerHTML = originalLabelContent;
            fileLabel.classList.remove('file-selected');
        }
    });

    // File Upload Handler
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const formData = new FormData();
        const fileInput = document.getElementById('recruitmentData');

        if (!fileInput.files[0]) {
            alert('Please select a file');
            return;
        }

        formData.append('recruitmentData', fileInput.files[0]);

        showLoadingSpinner(true);

        try {
            const response = await fetch('/api/process-excel', {
                method: 'POST',
                body: formData
            });

            // Check if response is actually JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned non-JSON response. Please check server status.');
            }

            const result = await response.json();

            if (response.ok) {
                currentData = result;
                displayResults(result);
                updateMetrics(result.summary);
                populateDataTable(result.data);
                renderChartsForTab('overview');

                // Auto-minimize upload section after successful upload
                minimizeUploadSection();
            } else {
                displayError(result.error || 'Upload failed with unknown error');
            }
        } catch (error) {
            console.error('Upload error:', error);
            if (error.name === 'SyntaxError') {
                displayError('Server returned invalid response. Please try again or check server logs.');
            } else {
                displayError('Upload failed: ' + error.message);
            }
        } finally {
            showLoadingSpinner(false);
        }
    });

    function showLoadingSpinner(show) {
        loadingSpinner.style.display = show ? 'flex' : 'none';
    }

    function displayResults(result) {
        uploadResults.className = '';
        uploadResults.innerHTML = `
            <h3>✅ Upload Successful!</h3>
            <p><strong>File:</strong> ${result.filename}</p>
            <p><strong>Records processed:</strong> ${result.summary?.totalRecords || result.rowCount}</p>
            <p><strong>Processed at:</strong> ${new Date(result.processedAt || Date.now()).toLocaleString()}</p>
        `;
        uploadStatus.style.display = 'block';

        // Auto-hide success message after 10 seconds
        setTimeout(() => {
            if (uploadStatus && uploadStatus.style.display === 'block' && !uploadResults.classList.contains('error')) {
                uploadStatus.style.display = 'none';
            }
        }, 10000);
    }

    function displayError(error) {
        uploadResults.className = 'error';
        uploadResults.innerHTML = `
            <h3>❌ Upload Failed</h3>
            <p>${error}</p>
        `;
        uploadStatus.style.display = 'block';
    }

    function updateMetrics(summary) {
        if (!summary) return;

        document.getElementById('totalRecords').textContent = summary.totalRecords || 0;
        document.getElementById('totalPositions').textContent = summary.totalPositions || 0;
        document.getElementById('totalCVs').textContent = summary.totalCVs || 0;
        document.getElementById('activeRecruiters').textContent = summary.uniqueRecruiters || 0;
        document.getElementById('activeClients').textContent = summary.uniqueClients || 0;
        document.getElementById('positionsOnHold').textContent = summary.positionsOnHold || 0;
        
        // Add new CV sharing metrics if elements exist
        const avgDaysToCV = document.getElementById('avgDaysToFirstCV');
        if (avgDaysToCV) {
            avgDaysToCV.textContent = summary.averageDaysToFirstCV || 0;
        }
        
        const cvsSharedElement = document.getElementById('totalCVsShared');
        if (cvsSharedElement) {
            cvsSharedElement.textContent = summary.totalCVsShared || 0;
        }
    }

    function populateDataTable(data) {
        const tableBody = document.getElementById('dataTableBody');

        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="13" class="no-data">No data available</td></tr>';
            return;
        }

        tableBody.innerHTML = data.map(record => `
            <tr>
                <td>${record.recruiter || '-'}</td>
                <td>${record.bdm || '-'}</td>
                <td>${record.clientName || '-'}</td>
                <td>${record.positionName || '-'}</td>
                <td>${record.noOfPosition || '-'}</td>
                <td>${record.requisitionLoggedDate || '-'}</td>
                <td>${record.numberOfCVs || '-'}</td>
                <td>${record.firstCVSharedDate || '-'}</td>
                <td>${record.lastCVSharedDate || '-'}</td>
                <td>${record.cvsSharedCount || '-'}</td>
                <td>${record.daysToFirstCV !== null ? record.daysToFirstCV : '-'}</td>
                <td>${record.positionOnHoldDate || '-'}</td>
                <td>${record.days || '-'}</td>
                <td>${record.remarks || '-'}</td>
            </tr>
        `).join('');
    }

    function renderChartsForTab(tabName) {
        if (!currentData || !currentData.data) return;

        switch (tabName) {
            case 'positions':
                renderPositionCharts();
                break;
            case 'recruiters':
                renderRecruiterCharts();
                break;
            case 'bdm':
                renderBDMCharts();
                break;
            case 'clients':
                renderClientCharts();
                break;
            case 'timeline':
                renderTimelineCharts();
                break;
        }
    }

    function renderPositionCharts() {
        // Position Status Pie Chart (Active vs On Hold)
        const statusData = getPositionStatusData();
        renderChart('positionStatusChart', {
            type: 'pie',
            data: {
                labels: statusData.labels,
                datasets: [{
                    data: statusData.values,
                    backgroundColor: ['#48bb78', '#f56565', '#ed8936', '#4299e1'],
                    borderWidth: 2,
                    borderColor: '#2d3748',
                    hoverBorderWidth: 3,
                    hoverBorderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Position Status Distribution',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e2e8f0',
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed} (${percentage}%)`;
                            }
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    duration: 1000
                }
            }
        });

        // Positions by Client Chart
        const clientData = getPositionsByClientData();
        renderChart('positionsByClientChart', {
            type: 'bar',
            data: {
                labels: clientData.labels,
                datasets: [{
                    label: 'Total Positions',
                    data: clientData.values,
                    backgroundColor: '#4299e1',
                    borderColor: '#2b6cb0',
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBackgroundColor: '#63b3ed',
                    hoverBorderColor: '#2c5282'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Positions by Client',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y} positions`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#e2e8f0',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            stepSize: 1
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    }
                },
                animation: {
                    duration: 1200,
                    easing: 'easeOutBounce'
                }
            }
        });
    }

    function renderRecruiterCharts() {
        // Recruiter Performance Bar Chart (positions per recruiter)
        const posData = getPositionsByRecruiterData();
        renderChart('recruiterPerformanceChart', {
            type: 'bar',
            data: {
                labels: posData.labels,
                datasets: [{
                    label: 'Positions Handled',
                    data: posData.values,
                    backgroundColor: '#ed8936',
                    borderColor: '#c05621',
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBackgroundColor: '#f6ad55',
                    hoverBorderColor: '#9c4221'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Recruiter Performance - Positions Handled',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const recruiter = context.label;
                                const positions = context.parsed.y;
                                const cvData = getCVsByRecruiterData();
                                const cvIndex = cvData.labels.indexOf(recruiter);
                                const cvs = cvIndex >= 0 ? cvData.values[cvIndex] : 0;
                                const efficiency = positions > 0 ? (cvs / positions).toFixed(1) : 0;
                                return [
                                    `Positions: ${positions}`,
                                    `CVs Submitted: ${cvs}`,
                                    `CVs per Position: ${efficiency}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#e2e8f0',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            stepSize: 1
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    }
                },
                animation: {
                    duration: 1200,
                    easing: 'easeOutQuart'
                }
            }
        });

        // CV Submission Efficiency Chart
        const cvData = getCVsByRecruiterData();
        const efficiencyData = getRecruiterEfficiencyData();
        renderChart('recruiterPositionsChart', {
            type: 'bar',
            data: {
                labels: efficiencyData.labels,
                datasets: [{
                    label: 'CVs Submitted',
                    data: efficiencyData.cvs,
                    backgroundColor: '#48bb78',
                    borderColor: '#2f855a',
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: 'y'
                }, {
                    label: 'CV-to-Position Ratio',
                    data: efficiencyData.ratios,
                    type: 'line',
                    borderColor: '#f56565',
                    backgroundColor: 'rgba(245, 101, 101, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#f56565',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'CV Submission Efficiency by Recruiter',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    return `CVs Submitted: ${context.parsed.y}`;
                                } else {
                                    return `CV-to-Position Ratio: ${context.parsed.y.toFixed(1)}:1`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#e2e8f0',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        ticks: { color: '#e2e8f0' },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' },
                        title: {
                            display: true,
                            text: 'CVs Submitted',
                            color: '#e2e8f0'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        ticks: { color: '#e2e8f0' },
                        grid: { drawOnChartArea: false },
                        title: {
                            display: true,
                            text: 'CV-to-Position Ratio',
                            color: '#e2e8f0'
                        }
                    }
                },
                animation: {
                    duration: 1400,
                    easing: 'easeOutCubic'
                }
            }
        });
    }

    function renderBDMCharts() {
        // BDM Performance Overview (Positions and CVs)
        const bdmData = getBDMPerformanceData();
        renderChart('bdmPerformanceChart', {
            type: 'bar',
            data: {
                labels: bdmData.labels,
                datasets: [{
                    label: 'Positions Managed',
                    data: bdmData.positions,
                    backgroundColor: '#9f7aea',
                    borderColor: '#805ad5',
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: 'y'
                }, {
                    label: 'Total CVs Shared',
                    data: bdmData.cvsShared,
                    backgroundColor: '#38b2ac',
                    borderColor: '#319795',
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: 'y'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'BDM Performance - Positions & CVs',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            },
                            afterLabel: function(context) {
                                if (context.datasetIndex === 0) {
                                    const cvs = bdmData.cvsShared[context.dataIndex];
                                    const ratio = context.parsed.y > 0 ? (cvs / context.parsed.y).toFixed(1) : 0;
                                    return `CV-to-Position Ratio: ${ratio}:1`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#e2e8f0',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            stepSize: 1
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    }
                },
                animation: {
                    duration: 1200,
                    easing: 'easeOutQuart'
                }
            }
        });

        // BDM CV Sharing Efficiency with Timeline
        const efficiencyData = getBDMEfficiencyData();
        renderChart('bdmEfficiencyChart', {
            type: 'bar',
            data: {
                labels: efficiencyData.labels,
                datasets: [{
                    label: 'CVs Shared Count',
                    data: efficiencyData.cvsShared,
                    backgroundColor: '#48bb78',
                    borderColor: '#2f855a',
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: 'y'
                }, {
                    label: 'Avg Days to First CV',
                    data: efficiencyData.avgDaysToCV,
                    type: 'line',
                    borderColor: '#ed8936',
                    backgroundColor: 'rgba(237, 137, 54, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#ed8936',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'BDM CV Sharing Efficiency & Speed',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    return `CVs Shared: ${context.parsed.y}`;
                                } else {
                                    return `Avg Days to First CV: ${context.parsed.y.toFixed(1)} days`;
                                }
                            },
                            afterLabel: function(context) {
                                if (context.datasetIndex === 1) {
                                    const value = context.parsed.y;
                                    let status = 'Excellent';
                                    if (value > 20) status = 'Needs Improvement';
                                    else if (value > 10) status = 'Good';
                                    else if (value > 5) status = 'Very Good';
                                    return `Performance: ${status}`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#e2e8f0',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            stepSize: 1
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' },
                        title: {
                            display: true,
                            text: 'CVs Shared',
                            color: '#e2e8f0'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            callback: function(value) {
                                return value + ' days';
                            }
                        },
                        grid: { drawOnChartArea: false },
                        title: {
                            display: true,
                            text: 'Days to First CV',
                            color: '#e2e8f0'
                        }
                    }
                },
                animation: {
                    duration: 1400,
                    easing: 'easeOutCubic'
                }
            }
        });
    }

    function renderClientCharts() {
        // Client Activity Overview
        const activityData = getClientActivityData();
        renderChart('clientActivityChart', {
            type: 'bar',
            data: {
                labels: activityData.labels,
                datasets: [{
                    label: 'Total CVs',
                    data: activityData.cvs,
                    backgroundColor: '#4299e1',
                    borderColor: '#2b6cb0',
                    borderWidth: 1,
                    borderRadius: 4
                }, {
                    label: 'Positions',
                    data: activityData.positions,
                    backgroundColor: '#ed8936',
                    borderColor: '#c05621',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Client Activity Overview',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            },
                            afterLabel: function(context) {
                                if (context.datasetIndex === 0) {
                                    const positions = activityData.positions[context.dataIndex];
                                    const ratio = positions > 0 ? (context.parsed.y / positions).toFixed(1) : 0;
                                    return `CV-to-Position Ratio: ${ratio}:1`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#e2e8f0',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#e2e8f0' },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    }
                },
                animation: {
                    duration: 1200,
                    easing: 'easeOutBounce'
                }
            }
        });

        // Client Response Time Line Chart
        const responseData = getClientResponseTimeData();
        renderChart('clientDaysChart', {
            type: 'line',
            data: {
                labels: responseData.labels,
                datasets: [{
                    label: 'Average Response Time (Days)',
                    data: responseData.values,
                    borderColor: '#f56565',
                    backgroundColor: 'rgba(245, 101, 101, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#f56565',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Client Response Time Trends',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `Average Response: ${context.parsed.y} days`;
                            },
                            afterLabel: function(context) {
                                const value = context.parsed.y;
                                let status = 'Excellent';
                                if (value > 30) status = 'Needs Improvement';
                                else if (value > 15) status = 'Good';
                                return `Status: ${status}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#e2e8f0',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            callback: function(value) {
                                return value + ' days';
                            }
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    }
                },
                animation: {
                    duration: 1500,
                    easing: 'easeOutCubic'
                }
            }
        });
    }

    function renderTimelineCharts() {
        // Requisition vs CV Sharing Timeline Comparison
        const comparisonData = getRequisitionVsCVTimelineData();
        renderChart('timelineChart', {
            type: 'line',
            data: {
                labels: comparisonData.months,
                datasets: [{
                    label: 'Positions Logged',
                    data: comparisonData.positions,
                    borderColor: '#4299e1',
                    backgroundColor: 'rgba(66, 153, 225, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#4299e1',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    fill: false,
                    tension: 0.4
                }, {
                    label: 'CVs Submitted',
                    data: comparisonData.cvsSubmitted,
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#48bb78',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    fill: false,
                    tension: 0.4
                }, {
                    label: 'Average Days to First CV',
                    data: comparisonData.avgDaysToCV,
                    borderColor: '#ed8936',
                    backgroundColor: 'rgba(237, 137, 54, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#ed8936',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Requisition vs CV Submission Timeline',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                if (context.datasetIndex === 2) {
                                    return `${context.dataset.label}: ${context.parsed.y.toFixed(1)} days`;
                                }
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#e2e8f0' },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            stepSize: 1
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' },
                        title: {
                            display: true,
                            text: 'Count',
                            color: '#e2e8f0'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            callback: function(value) {
                                return value + ' days';
                            }
                        },
                        grid: { drawOnChartArea: false },
                        title: {
                            display: true,
                            text: 'Days to First CV',
                            color: '#e2e8f0'
                        }
                    }
                },
                animation: {
                    duration: 1500,
                    easing: 'easeOutCubic'
                }
            }
        });

        // Monthly CV Submission Trends
        const monthlyData = getMonthlyTrendData();
        renderChart('monthlyCVChart', {
            type: 'bar',
            data: {
                labels: monthlyData.months,
                datasets: [{
                    label: 'CVs Submitted',
                    data: monthlyData.cvsSubmitted,
                    backgroundColor: '#48bb78',
                    borderColor: '#2f855a',
                    borderWidth: 1,
                    borderRadius: 4
                }, {
                    label: 'Positions Logged',
                    data: monthlyData.positions,
                    backgroundColor: '#4299e1',
                    borderColor: '#2b6cb0',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Monthly CV Submission & Position Trends',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            },
                            afterLabel: function(context) {
                                if (context.datasetIndex === 0) {
                                    const positions = monthlyData.positions[context.dataIndex];
                                    const ratio = positions > 0 ? (context.parsed.y / positions).toFixed(1) : 0;
                                    return `CV-to-Position Ratio: ${ratio}:1`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#e2e8f0' },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            stepSize: 1
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    }
                },
                animation: {
                    duration: 1500,
                    easing: 'easeOutCubic'
                }
            }
        });
    }

    function renderClientCharts() {
        // Client Activity Overview
        const activityData = getClientActivityData();
        renderChart('clientActivityChart', {
            type: 'bar',
            data: {
                labels: activityData.labels,
                datasets: [{
                    label: 'Total CVs',
                    data: activityData.cvs,
                    backgroundColor: '#4299e1',
                    borderColor: '#2b6cb0',
                    borderWidth: 1,
                    borderRadius: 4
                }, {
                    label: 'Positions',
                    data: activityData.positions,
                    backgroundColor: '#ed8936',
                    borderColor: '#c05621',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Client Activity Overview',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            },
                            afterLabel: function(context) {
                                if (context.datasetIndex === 0) {
                                    const positions = activityData.positions[context.dataIndex];
                                    const ratio = positions > 0 ? (context.parsed.y / positions).toFixed(1) : 0;
                                    return `CV-to-Position Ratio: ${ratio}:1`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#e2e8f0',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#e2e8f0' },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    }
                }
            }
        });

        // Client Response Time Line Chart
        const responseData = getClientResponseTimeData();
        renderChart('clientDaysChart', {
            type: 'line',
            data: {
                labels: responseData.labels,
                datasets: [{
                    label: 'Average Response Time (Days)',
                    data: responseData.values,
                    borderColor: '#f56565',
                    backgroundColor: 'rgba(245, 101, 101, 0.1)',
                    borderWidth: 3,
                    pointBackgroundColor: '#f56565',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Client Response Time Trends',
                        color: '#e2e8f0',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 55, 72, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#e2e8f0',
                        borderColor: '#4a5568',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `Average Response: ${context.parsed.y} days`;
                            },
                            afterLabel: function(context) {
                                const value = context.parsed.y;
                                let status = 'Excellent';
                                if (value > 30) status = 'Needs Improvement';
                                else if (value > 15) status = 'Good';
                                return `Status: ${status}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#e2e8f0',
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#e2e8f0',
                            callback: function(value) {
                                return value + ' days';
                            }
                        },
                        grid: { color: 'rgba(74, 85, 104, 0.3)' }
                    }
                },
                animation: {
                    duration: 1500,
                    easing: 'easeOutCubic'
                }
            }
        });
    }

    function renderChart(canvasId, config) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // Destroy existing chart if it exists
        if (charts[canvasId]) {
            charts[canvasId].destroy();
        }

        charts[canvasId] = new Chart(ctx, config);
    }

    function getChartOptions(title, scales = false) {
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    labels: {
                        color: '#e2e8f0'
                    }
                }
            }
        };

        if (scales) {
            options.scales = {
                x: {
                    ticks: { color: '#e2e8f0' },
                    grid: { color: '#4a5568' }
                },
                y: {
                    ticks: { color: '#e2e8f0' },
                    grid: { color: '#4a5568' }
                }
            };
        }

        return options;
    }

    // Data Processing Functions
    function getPositionStatusData() {
        const data = currentData.data || [];
        
        // Debug logging
        console.log('Total records:', data.length);
        console.log('Sample records with position data:', data.slice(0, 3).map(r => ({
            client: r.clientName,
            position: r.positionName,
            noOfPosition: r.noOfPosition,
            onHoldDate: r.positionOnHoldDate
        })));
        
        // Sum actual positions, not just count records
        const activeRecords = data.filter(r => !r.positionOnHoldDate);
        const onHoldRecords = data.filter(r => r.positionOnHoldDate);
        
        const active = activeRecords.reduce((sum, record) => {
            const positions = record.noOfPosition || 1;
            console.log(`Active record: ${record.clientName} - ${record.positionName}, positions: ${positions}`);
            return sum + positions;
        }, 0);
            
        const onHold = onHoldRecords.reduce((sum, record) => {
            const positions = record.noOfPosition || 1;
            console.log(`On Hold record: ${record.clientName} - ${record.positionName}, positions: ${positions}`);
            return sum + positions;
        }, 0);

        console.log('Final calculation - Active:', active, 'On Hold:', onHold);

        return {
            labels: ['Active', 'On Hold'],
            values: [active, onHold]
        };
    }

    function getPositionsByClientData() {
        const data = currentData.data || [];
        const clientCounts = {};

        data.forEach(record => {
            const client = record.clientName || 'Unknown';
            clientCounts[client] = (clientCounts[client] || 0) + (record.noOfPosition || 1);
        });

        const sorted = Object.entries(clientCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        return {
            labels: sorted.map(([client]) => client),
            values: sorted.map(([,count]) => count)
        };
    }

    function getCVsByRecruiterData() {
        const data = currentData.data || [];
        const recruiterCVs = {};

        data.forEach(record => {
            const recruiter = record.recruiter || 'Unknown';
            recruiterCVs[recruiter] = (recruiterCVs[recruiter] || 0) + (record.numberOfCVs || 0);
        });

        const sorted = Object.entries(recruiterCVs)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        return {
            labels: sorted.map(([recruiter]) => recruiter),
            values: sorted.map(([,cvs]) => cvs)
        };
    }

    function getPositionsByRecruiterData() {
        const data = currentData.data || [];
        const recruiterPositions = {};

        data.forEach(record => {
            const recruiter = record.recruiter || 'Unknown';
            recruiterPositions[recruiter] = (recruiterPositions[recruiter] || 0) + (record.noOfPosition || 1);
        });

        const sorted = Object.entries(recruiterPositions)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        return {
            labels: sorted.map(([recruiter]) => recruiter),
            values: sorted.map(([,positions]) => positions)
        };
    }

    function getClientActivityData() {
        const data = currentData.data || [];
        const clientStats = {};

        data.forEach(record => {
            const client = record.clientName || 'Unknown';
            if (!clientStats[client]) {
                clientStats[client] = { cvs: 0, positions: 0 };
            }
            clientStats[client].cvs += record.numberOfCVs || 0;
            clientStats[client].positions += record.noOfPosition || 1;
        });

        const sorted = Object.entries(clientStats)
            .sort(([,a], [,b]) => (b.cvs + b.positions) - (a.cvs + a.positions))
            .slice(0, 8);

        return {
            labels: sorted.map(([client]) => client),
            cvs: sorted.map(([,stats]) => stats.cvs),
            positions: sorted.map(([,stats]) => stats.positions)
        };
    }

    function getAverageDaysByClientData() {
        const data = currentData.data || [];
        const clientDays = {};

        data.forEach(record => {
            const client = record.clientName || 'Unknown';
            if (record.days !== null && record.days !== undefined) {
                if (!clientDays[client]) {
                    clientDays[client] = { total: 0, count: 0 };
                }
                clientDays[client].total += record.days;
                clientDays[client].count += 1;
            }
        });

        const averages = Object.entries(clientDays)
            .map(([client, stats]) => [client, Math.round(stats.total / stats.count)])
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8);

        return {
            labels: averages.map(([client]) => client),
            values: averages.map(([,avg]) => avg)
        };
    }

    function getRecruiterEfficiencyData() {
        const data = currentData.data || [];
        const recruiterStats = {};

        data.forEach(record => {
            const recruiter = record.recruiter || 'Unknown';
            if (!recruiterStats[recruiter]) {
                recruiterStats[recruiter] = { cvs: 0, positions: 0 };
            }
            recruiterStats[recruiter].cvs += record.numberOfCVs || 0;
            recruiterStats[recruiter].positions += record.noOfPosition || 1;
        });

        const sorted = Object.entries(recruiterStats)
            .filter(([,stats]) => stats.positions > 0)
            .map(([recruiter, stats]) => [
                recruiter, 
                stats.cvs, 
                stats.cvs / stats.positions
            ])
            .sort(([,,,a], [,,,b]) => b - a)
            .slice(0, 8);

        return {
            labels: sorted.map(([recruiter]) => recruiter),
            cvs: sorted.map(([,cvs]) => cvs),
            ratios: sorted.map(([,,ratio]) => ratio)
        };
    }

    function getClientResponseTimeData() {
        const data = currentData.data || [];
        const clientDays = {};

        data.forEach(record => {
            const client = record.clientName || 'Unknown';
            if (record.days !== null && record.days !== undefined) {
                if (!clientDays[client]) {
                    clientDays[client] = { total: 0, count: 0 };
                }
                clientDays[client].total += record.days;
                clientDays[client].count += 1;
            }
        });

        const averages = Object.entries(clientDays)
            .map(([client, stats]) => [client, Math.round(stats.total / stats.count)])
            .sort(([,a], [,b]) => a - b) // Sort by response time (ascending)
            .slice(0, 8);

        return {
            labels: averages.map(([client]) => client),
            values: averages.map(([,avg]) => avg)
        };
    }

    function getMonthlyTrendData() {
        const data = currentData.data || [];
        const monthlyStats = {};

        // Process data by month
        data.forEach(record => {
            if (record.requisitionLoggedDate) {
                const date = new Date(record.requisitionLoggedDate);
                if (!isNaN(date.getTime())) {
                    const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

                    if (!monthlyStats[monthKey]) {
                        monthlyStats[monthKey] = { positions: 0, cvsSubmitted: 0 };
                    }
                    monthlyStats[monthKey].positions += record.noOfPosition || 1;
                    monthlyStats[monthKey].cvsSubmitted += record.numberOfCVs || 0;
                }
            }
        });

        // Get last 12 months or available data
        const sortedMonths = Object.keys(monthlyStats).sort((a, b) => new Date(a + ' 1, 2000') - new Date(b + ' 1, 2000'));
        const recentMonths = sortedMonths.slice(-12);

        return {
            months: recentMonths.length > 0 ? recentMonths : ['No Data'],
            positions: recentMonths.map(month => monthlyStats[month]?.positions || 0),
            cvsSubmitted: recentMonths.map(month => monthlyStats[month]?.cvsSubmitted || 0)
        };
    }

    function getMonthlyCVTrendData() {
        const data = currentData.data || [];
        const monthlyStats = {};

        data.forEach(record => {
            if (record.requisitionLoggedDate) {
                const date = new Date(record.requisitionLoggedDate);
                const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

                if (!monthlyStats[monthKey]) {
                    monthlyStats[monthKey] = { submissions: 0, positions: 0 };
                }
                monthlyStats[monthKey].submissions += record.numberOfCVs || 0;
                monthlyStats[monthKey].positions += record.noOfPosition || 1;
            }
        });

        const sortedMonths = Object.keys(monthlyStats).sort((a, b) => new Date(a) - new Date(b));
        const recentMonths = sortedMonths.slice(-12);

        return {
            months: recentMonths,
            submissions: recentMonths.map(month => monthlyStats[month]?.submissions || 0),
            conversionRates: recentMonths.map(month => {
                const stats = monthlyStats[month];
                return stats && stats.positions > 0 ? (stats.submissions / stats.positions) * 10 : 0; // Normalize for display
            })
        };
    }

    function getRequisitionVsCVTimelineData() {
        const data = currentData.data || [];
        const monthlyStats = {};

        data.forEach(record => {
            // Process by requisition date
            if (record.requisitionLoggedDate) {
                const reqDate = new Date(record.requisitionLoggedDate);
                if (!isNaN(reqDate.getTime())) {
                    const monthKey = reqDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

                    if (!monthlyStats[monthKey]) {
                        monthlyStats[monthKey] = { 
                            positions: 0, 
                            cvsSubmitted: 0, 
                            totalDaysToCV: 0, 
                            recordsWithCV: 0 
                        };
                    }
                    monthlyStats[monthKey].positions += record.noOfPosition || 1;
                    monthlyStats[monthKey].cvsSubmitted += record.numberOfCVs || 0;

                    // Process days to first CV
                    if (record.daysToFirstCV !== null && record.daysToFirstCV !== undefined) {
                        monthlyStats[monthKey].totalDaysToCV += record.daysToFirstCV;
                        monthlyStats[monthKey].recordsWithCV += 1;
                    }
                }
            }
        });

        // Fill in missing months for continuity
        const sortedMonths = Object.keys(monthlyStats).sort((a, b) => new Date(a + ' 1, 2000') - new Date(b + ' 1, 2000'));
        const recentMonths = sortedMonths.slice(-12);

        return {
            months: recentMonths.length > 0 ? recentMonths : ['No Data'],
            positions: recentMonths.map(month => monthlyStats[month]?.positions || 0),
            cvsSubmitted: recentMonths.map(month => monthlyStats[month]?.cvsSubmitted || 0),
            avgDaysToCV: recentMonths.map(month => {
                const stats = monthlyStats[month];
                return stats && stats.recordsWithCV > 0 
                    ? Math.round(stats.totalDaysToCV / stats.recordsWithCV)
                    : 0;
            })
        };
    }

    function getCVSharingEfficiencyData() {
        const data = currentData.data || [];
        const recruiterStats = {};

        data.forEach(record => {
            const recruiter = record.recruiter || 'Unknown';
            if (!recruiterStats[recruiter]) {
                recruiterStats[recruiter] = { 
                    positions: 0, 
                    cvsShared: 0, 
                    totalDaysToCV: 0, 
                    recordsWithCV: 0 
                };
            }
            
            recruiterStats[recruiter].positions += record.noOfPosition || 1;
            recruiterStats[recruiter].cvsShared += record.cvsSharedCount || 0;
            
            if (record.daysToFirstCV !== null) {
                recruiterStats[recruiter].totalDaysToCV += record.daysToFirstCV;
                recruiterStats[recruiter].recordsWithCV += 1;
            }
        });

        const sorted = Object.entries(recruiterStats)
            .filter(([,stats]) => stats.positions > 0)
            .map(([recruiter, stats]) => [
                recruiter,
                stats.cvsShared,
                stats.recordsWithCV > 0 ? Math.round(stats.totalDaysToCV / stats.recordsWithCV) : 0
            ])
            .sort(([,,,a], [,,,b]) => a - b) // Sort by average days (ascending = better)
            .slice(0, 8);

        return {
            labels: sorted.map(([recruiter]) => recruiter),
            cvsShared: sorted.map(([,cvs]) => cvs),
            avgDaysToCV: sorted.map(([,,days]) => days)
        };
    }

    function getBDMPerformanceData() {
        const data = currentData.data || [];
        const bdmStats = {};

        data.forEach(record => {
            const bdm = record.bdm || 'Unknown';
            if (!bdmStats[bdm]) {
                bdmStats[bdm] = { 
                    positions: 0, 
                    cvsShared: 0, 
                    recruiters: new Set(),
                    clients: new Set()
                };
            }
            
            bdmStats[bdm].positions += record.noOfPosition || 1;
            bdmStats[bdm].cvsShared += record.numberOfCVs || 0; // Fixed: use numberOfCVs instead of cvsSharedCount
            
            if (record.recruiter) bdmStats[bdm].recruiters.add(record.recruiter);
            if (record.clientName) bdmStats[bdm].clients.add(record.clientName);
        });

        const sorted = Object.entries(bdmStats)
            .filter(([bdm]) => bdm !== 'Unknown')
            .sort(([,a], [,b]) => b.positions - a.positions)
            .slice(0, 10);

        return {
            labels: sorted.map(([bdm]) => bdm),
            positions: sorted.map(([,stats]) => stats.positions),
            cvsShared: sorted.map(([,stats]) => stats.cvsShared),
            recruiters: sorted.map(([,stats]) => stats.recruiters.size),
            clients: sorted.map(([,stats]) => stats.clients.size)
        };
    }

    function getBDMEfficiencyData() {
        const data = currentData.data || [];
        const bdmStats = {};

        data.forEach(record => {
            const bdm = record.bdm || 'Unknown';
            if (!bdmStats[bdm]) {
                bdmStats[bdm] = { 
                    positions: 0, 
                    cvsShared: 0, 
                    totalDaysToCV: 0, 
                    recordsWithCV: 0,
                    totalCVsReceived: 0
                };
            }
            
            bdmStats[bdm].positions += record.noOfPosition || 1;
            bdmStats[bdm].cvsShared += record.numberOfCVs || 0; // Fixed: use numberOfCVs instead of cvsSharedCount
            bdmStats[bdm].totalCVsReceived += record.numberOfCVs || 0;
            
            if (record.daysToFirstCV !== null) {
                bdmStats[bdm].totalDaysToCV += record.daysToFirstCV;
                bdmStats[bdm].recordsWithCV += 1;
            }
        });

        const sorted = Object.entries(bdmStats)
            .filter(([bdm]) => bdm !== 'Unknown' && bdm !== null)
            .map(([bdm, stats]) => [
                bdm,
                stats.cvsShared,
                stats.recordsWithCV > 0 ? Math.round(stats.totalDaysToCV / stats.recordsWithCV) : 0,
                stats.totalCVsReceived
            ])
            .sort(([,,,a], [,,,b]) => b - a) // Sort by total CVs received (descending)
            .slice(0, 8);

        return {
            labels: sorted.map(([bdm]) => bdm),
            cvsShared: sorted.map(([,shared]) => shared),
            avgDaysToCV: sorted.map(([,,days]) => days),
            totalCVs: sorted.map(([,,,total]) => total)
        };
    }

    // Search functionality for data table
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const rows = document.querySelectorAll('#dataTableBody tr');

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    }

    // Export functionality
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            if (!currentData || !currentData.data) {
                alert('No data to export');
                return;
            }

            const csv = convertToCSV(currentData.data);
            downloadCSV(csv, 'recruitment_data.csv');
        });
    }

    function convertToCSV(data) {
        const headers = ['Recruiter', 'BDM', 'Client Name', 'Position Name', 'No Of Position', 
                        'Requisition Date', 'Number Of CVs', 'On Hold Date', 'Days', 'Remarks'];

        const csvContent = [
            headers.join(','),
            ...data.map(row => [
                row.recruiter || '',
                row.bdm || '',
                row.clientName || '',
                row.positionName || '',
                row.noOfPosition || '',
                row.requisitionLoggedDate || '',
                row.numberOfCVs || '',
                row.positionOnHoldDate || '',
                row.days || '',
                row.remarks || ''
            ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return csvContent;
    }

    function downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    function minimizeUploadSection() {
        const uploadSection = document.querySelector('.upload-section');
        const uploadForm = document.getElementById('uploadForm');

        if (uploadSection && uploadForm) {
            // Add minimized class for styling
            uploadSection.classList.add('minimized');

            // Hide the form content
            uploadForm.style.display = 'none';

            // Remove expanded header if it exists
            const expandedHeader = uploadSection.querySelector('.expanded-header');
            if (expandedHeader) {
                expandedHeader.remove();
            }

            // Create or update the minimized header
            let minimizedHeader = uploadSection.querySelector('.minimized-header');
            if (!minimizedHeader) {
                minimizedHeader = document.createElement('div');
                minimizedHeader.className = 'minimized-header';
                uploadSection.insertBefore(minimizedHeader, uploadForm);
            }

            const fileName = currentData?.filename || 'File uploaded';
            minimizedHeader.innerHTML = `
                <div class="minimized-content">
                    <span class="upload-icon">✅</span>
                    <span class="file-info">${fileName} - Successfully processed</span>
                    <button class="expand-btn" onclick="expandUploadSection()">📂 Change File</button>
                </div>
            `;
        }
    }

    // Make expandUploadSection available globally
    window.expandUploadSection = function() {
        const uploadSection = document.querySelector('.upload-section');
        const uploadForm = document.getElementById('uploadForm');

        if (uploadSection && uploadForm) {
            uploadSection.classList.remove('minimized');
            uploadForm.style.display = 'block';

            // Remove minimized header
            const minimizedHeader = uploadSection.querySelector('.minimized-header');
            if (minimizedHeader) {
                minimizedHeader.remove();
            }

            // Add "Keep Current File" button in the same position
            addKeepCurrentFileButton();
        }
    };

    // Add Keep Current File button when user expands upload section
    function addKeepCurrentFileButton() {
        const uploadSection = document.querySelector('.upload-section');
        let keepFileBtn = document.getElementById('keepCurrentFileBtn');

        // Remove existing button if it exists
        if (keepFileBtn) {
            keepFileBtn.remove();
        }

        // Only add if we have current data
        if (currentData) {
            // Create a header similar to minimized header but for expanded state
            let expandedHeader = uploadSection.querySelector('.expanded-header');
            if (!expandedHeader) {
                expandedHeader = document.createElement('div');
                expandedHeader.className = 'expanded-header';
                uploadSection.insertBefore(expandedHeader, uploadSection.querySelector('h2').nextSibling);
            }

            const fileName = currentData?.filename || 'File uploaded';
            expandedHeader.innerHTML = `
                <div class="minimized-content">
                    <span class="upload-icon">✅</span>
                    <span class="file-info">${fileName} - Successfully processed</span>
                    <button class="expand-btn keep-current-btn" onclick="keepCurrentFile()">↩️ Keep Current File</button>
                </div>
            `;
        }
    }

    // Make function available globally for potential future use
    window.keepCurrentFile = function() {
        minimizeUploadSection();
    };

    // Initialize with placeholder charts
    setTimeout(() => {
        renderPlaceholderCharts();
    }, 100);

    function renderPlaceholderCharts() {
        const placeholderConfig = {
            type: 'doughnut',
            data: {
                labels: ['No Data'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#4a5568']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        };

        // Render placeholder for all chart canvases
        const chartIds = ['positionStatusChart', 'positionsByClientChart', 'recruiterPerformanceChart', 
                         'recruiterPositionsChart', 'clientActivityChart', 'clientDaysChart'];

        chartIds.forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas) {
                canvas.getContext('2d').fillStyle = '#4a5568';
                canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
            }
        });
    }
});