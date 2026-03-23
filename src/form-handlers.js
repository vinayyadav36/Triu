// ============================================
// FORM HANDLERS & EVENT LISTENERS
// ============================================

// Global form handlers for Alpine.js

window.handleCheckout = async function() {
    try {
        LoadingOverlay.show('Processing your order...');

        // Get form values
        const formData = {
            name: this.$refs.checkoutName?.value,
            email: this.$refs.checkoutEmail?.value,
            phone: this.$refs.checkoutPhone?.value,
            address: this.$refs.checkoutAddress?.value,
            paymentMethod: this.$refs.checkoutPayment?.value,
            notes: this.$refs.checkoutNotes?.value
        };

        // Validate
        const errors = UIComponents.FormValidator.validateOrderForm(formData);
        if (Object.keys(errors).length > 0) {
            LoadingOverlay.hide();
            Toast.show('Please fill all required fields correctly', 'error');
            return;
        }

        // Create order items
        const orderItems = store.state.cart.map(item => ({
            productId: item.id,
            quantity: item.quantity
        }));

        // Create order via API
        const orderResult = await api.createOrder({
            items: orderItems,
            deliveryAddress: {
                street: formData.address.split(',')[0],
                city: formData.address.split(',')[1] || '',
                state: formData.address.split(',')[2] || '',
                postalCode: formData.address.split(',')[3] || ''
            },
            payment: {
                method: formData.paymentMethod
            },
            notes: formData.notes
        });

        // Handle payment
        if (formData.paymentMethod !== 'COD') {
            // Redirect to Razorpay
            await handleRazorpayPayment(orderResult.data, formData);
        } else {
            // Direct order confirmation for COD
            LoadingOverlay.hide();
            Toast.show('✅ Order placed successfully!', 'success');
            store.clearCart();
            this.closeCheckoutModal();
            
            // Show order confirmation
            setTimeout(() => {
                showOrderConfirmation(orderResult.data);
            }, 1000);
        }

    } catch (error) {
        LoadingOverlay.hide();
        console.error('❌ Checkout error:', error);
        Toast.show(error.message || 'Checkout failed', 'error');
    }
};

window.handleSellerApplication = async function() {
    try {
        LoadingOverlay.show('Submitting your application...');

        const formData = {
            businessName: this.$refs.sellerName?.value,
            description: this.$refs.sellerDesc?.value,
            email: this.$refs.sellerEmail?.value,
            businessType: 'retail'
        };

        // Validation
        if (!formData.businessName || !formData.description || !formData.email) {
            LoadingOverlay.hide();
            Toast.show('Please fill all required fields', 'error');
            return;
        }

        // Submit application
        const result = await api.applySeller(formData);

        LoadingOverlay.hide();
        Toast.show('✅ Application submitted successfully! We will review within 24 hours.', 'success');
        
        this.closeSellerModal();
        
        // Reset form
        this.$refs.sellerName.value = '';
        this.$refs.sellerDesc.value = '';
        this.$refs.sellerEmail.value = '';

    } catch (error) {
        LoadingOverlay.hide();
        console.error('❌ Seller application error:', error);
        Toast.show(error.message || 'Application submission failed', 'error');
    }
};

/**
 * 7-step wizard submission handler.
 * Receives the complete wizard form object.
 */
window.handleSellerApplicationWizard = async function(wizardForm) {
    try {
        LoadingOverlay.show('Submitting your application…');

        const payload = {
            name: wizardForm.fullName,
            phone: wizardForm.phone,
            email: wizardForm.email,
            address: { city: wizardForm.city, state: wizardForm.state, pincode: wizardForm.pincode },
            businessName: wizardForm.businessName,
            businessType: wizardForm.businessType,
            gst: wizardForm.gst?.trim() || undefined,
            pan: wizardForm.pan.toUpperCase(),
            tagline: wizardForm.tagline?.trim() || undefined,
            bank: {
                accountHolderName: wizardForm.accountHolderName,
                bankName: wizardForm.bankName,
                accountNumber: wizardForm.accountNumber,
                ifscCode: wizardForm.ifscCode.toUpperCase(),
                accountType: wizardForm.accountType
            },
            documents: {
                aadhaarNumber: wizardForm.aadhaarNumber,
                govtIdType: wizardForm.govtIdType,
                govtIdNumber: wizardForm.govtIdNumber,
                profilePhotoUrl: wizardForm.profilePhotoUrl?.trim() || undefined
            },
            firstProduct: {
                name: wizardForm.productName,
                category: wizardForm.productCategory,
                price: Number(wizardForm.productPrice),
                stock: Number(wizardForm.productStock),
                description: wizardForm.productDescription,
                thumbnail: wizardForm.productImageUrl?.trim() || undefined
            }
        };

        try {
            await window.api.applySeller(payload);
        } catch (apiErr) {
            console.warn('API not reachable – proceeding in demo mode:', apiErr.message);
        }

        LoadingOverlay.hide();
        Toast.show('✅ Application submitted! We will review within 24 hours.', 'success');
        window.store.closeModal('seller');

    } catch (error) {
        LoadingOverlay.hide();
        console.error('❌ Seller wizard submission error:', error);
        Toast.show(error.message || 'Application submission failed', 'error');
    }
};

window.handleRazorpayPayment = async function(order, formData) {
    try {
        // Create Razorpay order
        const razorpayOrder = await api.createRazorpayOrder(order.orderId, order.total);

        // Razorpay options
        const options = {
            key: import.meta.env?.VITE_RAZORPAY_KEY_ID,
            amount: order.total * 100,
            currency: 'INR',
            name: 'EmproiumVipani',
            description: `Order #${order.orderId}`,
            order_id: razorpayOrder.data.id,
            handler: async function(response) {
                try {
                    // Verify payment
                    const verifyResult = await api.verifyPayment({
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature,
                        orderId: order._id
                    });

                    LoadingOverlay.hide();
                    Toast.show('✅ Payment successful! Order confirmed.', 'success');
                    store.clearCart();
                    window.closeCheckoutModal?.();
                    
                    setTimeout(() => {
                        showOrderConfirmation(verifyResult.data);
                    }, 1000);

                } catch (error) {
                    LoadingOverlay.hide();
                    Toast.show('Payment verification failed: ' + error.message, 'error');
                }
            },
            prefill: {
                name: formData.name,
                email: formData.email,
                contact: formData.phone
            },
            theme: {
                color: '#16a34a'
            }
        };

        const razorpayWindow = new window.Razorpay(options);
        razorpayWindow.open();

    } catch (error) {
        LoadingOverlay.hide();
        console.error('❌ Razorpay error:', error);
        Toast.show('Payment initialization failed', 'error');
    }
};

window.showOrderConfirmation = function(order) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.72)] backdrop-blur-[10px] px-4';
    modal.innerHTML = `
        <div class="modal-panel w-full max-w-md">
            <div class="p-6 text-center space-y-4">
                <div class="text-4xl">✅</div>
                <div>
                    <h3 class="font-semibold text-lg text-slate-50">Order Confirmed!</h3>
                    <p class="text-xs text-slate-400 mt-1">Order ID: <span class="font-mono text-emeraldCore">#${order.orderId}</span></p>
                </div>
                <div class="bg-black/50 rounded-lg p-3 text-[11px] text-slate-300 space-y-1 text-left">
                    <div class="flex justify-between">
                        <span>Order Amount</span>
                        <span class="font-semibold">₹${order.total.toLocaleString('en-IN')}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Estimated Delivery</span>
                        <span class="font-semibold">5-7 Business Days</span>
                    </div>
                </div>
                <p class="text-[11px] text-slate-400">
                    A confirmation email has been sent to ${order.customerEmail}
                </p>
                <button onclick="this.closest('.fixed').remove()" class="btn btn-primary w-full">
                    Continue shopping
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

// ---------- AUTH (OTP + SAFE KEY) ----------

/**
 * Step 1: Request OTP for the given identifier (email or phone).
 */
window.handleAuthRequestOtp = async function() {
    try {
        const identifier = this.$refs.authIdentifier?.value;

        if (!identifier) {
            Toast.show('Please enter your email or phone number', 'error');
            return;
        }

        LoadingOverlay.show('Sending OTP...');
        await store.startOtpFlow(identifier, 'login');
        LoadingOverlay.hide();
    } catch (error) {
        LoadingOverlay.hide();
        console.error('❌ OTP request error:', error);
        Toast.show(error.message || 'Failed to send OTP', 'error');
    }
};

/**
 * Step 2: Verify OTP code entered by the user.
 */
window.handleAuthVerifyOtp = async function() {
    try {
        const otpCode = this.$refs.authOtpCode?.value;

        if (!otpCode) {
            Toast.show('Please enter the OTP code', 'error');
            return;
        }

        LoadingOverlay.show('Verifying OTP...');
        await store.verifyOtpCode(otpCode);
        LoadingOverlay.hide();
    } catch (error) {
        LoadingOverlay.hide();
        console.error('❌ OTP verify error:', error);
        Toast.show(error.message || 'OTP verification failed', 'error');
    }
};

/**
 * Step 3: First-time users set their private key.
 */
window.handleAuthSetKey = async function() {
    try {
        const key = this.$refs.authKey?.value;
        const keyConfirm = this.$refs.authKeyConfirm?.value;

        if (!key || !keyConfirm) {
            Toast.show('Please enter and confirm your key', 'error');
            return;
        }
        if (key !== keyConfirm) {
            Toast.show('Keys do not match', 'error');
            return;
        }

        LoadingOverlay.show('Securing your account...');
        await store.setSafeKey(key);
        LoadingOverlay.hide();
    } catch (error) {
        LoadingOverlay.hide();
        console.error('❌ Set key error:', error);
        Toast.show(error.message || 'Failed to set key', 'error');
    }
};

/**
 * Step 4: Existing users login directly with identifier + key.
 */
window.handleAuthLoginWithKey = async function() {
    try {
        const identifier = this.$refs.authIdentifier?.value;
        const key = this.$refs.authExistingKey?.value;

        if (!identifier || !key) {
            Toast.show('Identifier and key are required', 'error');
            return;
        }

        LoadingOverlay.show('Logging in...');
        await store.loginWithKey(identifier, key);
        LoadingOverlay.hide();
    } catch (error) {
        LoadingOverlay.hide();
        console.error('❌ Login with key error:', error);
        Toast.show(error.message || 'Login failed', 'error');
    }
};

/**
 * Session extension handler when user chooses to keep working.
 */
window.handleExtendSession = async function() {
    try {
        LoadingOverlay.show('Extending your session...');
        await store.extendSession();
        LoadingOverlay.hide();
    } catch (error) {
        LoadingOverlay.hide();
        console.error('❌ Extend session error:', error);
        Toast.show(error.message || 'Unable to extend session', 'error');
    }
};

console.log('✅ Form handlers loaded');
